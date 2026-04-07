import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import Groq from 'groq-sdk';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { mirrorChatMessageToSupabase, mirrorDocumentToSupabase, mirrorUserToSupabase } from './supabase.js';

const MAX_TITLE_LENGTH = 160;
const MAX_CONTENT_LENGTH = 500000;
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function encodeDocStateFromContent(content = '', title = 'untitled') {
  const ydoc = new Y.Doc();
  ydoc.getText('quill').insert(0, content);
  ydoc.getText('title').insert(0, title || 'untitled');
  const state = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return state;
}

const app = express();
const server = createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || 'replace_with_a_long_random_secret';
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ─── Groq Client ────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function ensureGroqConfigured(res) {
  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({ error: 'GROQ_API_KEY is missing in backend/.env' });
    return false;
  }
  return true;
}

function buildAiCommandPrompt(instruction, selectionText, documentText) {
  return [
    'You are an elite collaborative writing assistant and AI consultant.',
    'Your goal is to provide high-quality, professional, and contextually aware text enhancements.',
    '',
    'RULES:',
    '- Return ONLY the final text to be inserted or replaced.',
    '- DO NOT include markdown code fences or conversational filler.',
    '- Maintain the existing tone and formatting of the document unless instructed otherwise.',
    '- If summarizing, be concise but useful.',
    '- If refining, improve clarity, grammar, and impact.',
    '',
    `INSTRUCTION: ${instruction}`,
    '',
    'SELECTED TEXT TO OPERATE ON:',
    selectionText || '(none)',
    '',
    'FULL DOCUMENT CONTEXT:',
    documentText || '(none)',
    '',
    'RESPONSE:',
  ].join('\n');
}

function sanitizeTitle(value, fallback = 'Untitled') {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, MAX_TITLE_LENGTH);
}

function sanitizeContent(value) {
  return String(value ?? '').slice(0, MAX_CONTENT_LENGTH);
}

function isValidUuidLike(value) {
  return typeof value === 'string' && /^[0-9a-f-]{8,}$/i.test(value);
}

function safeJsonParse(value) {
  try {
    return { ok: true, data: JSON.parse(value) };
  } catch {
    return { ok: false, data: null };
  }
}

function reportServerError(res, error, fallbackMessage) {
  console.error(error);
  res.status(500).json({ error: fallbackMessage });
}

function mirrorSafely(label, operation) {
  return Promise.resolve(operation()).catch((error) => {
    console.warn(`${label} failed:`, error?.message || error);
  });
}

function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Y-Doc Store ─────────────────────────────────────────────────────────────
const docs = new Map(); // docId → { ydoc, awareness, connections }

function getOrCreateDoc(docId) {
  if (docs.has(docId)) return docs.get(docId);

  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);

  // Load persisted state
  const row = db.prepare('SELECT ydoc_state, content, title FROM documents WHERE id = ?').get(docId);
  if (row?.ydoc_state) {
    try { Y.applyUpdate(ydoc, row.ydoc_state); } catch (_) {}
  }

  // Auto-persist every 5 seconds when dirty
  let persistDirty = false;
  let revisionDirty = false;
  let currentContent = row?.content || '';
  let currentTitle = row?.title || 'Untitled';
  let lastRevisionSignature = `${currentTitle}::${currentContent}`;
  ydoc.on('update', () => { persistDirty = true; });

  const persistInterval = setInterval(() => {
    if (!persistDirty) return;
    persistDirty = false;
    const state = Y.encodeStateAsUpdate(ydoc);
    const text = ydoc.getText('quill');
    const title = ydoc.getText('title');
    const nextTitle = currentTitle || title.toString() || 'Untitled';
    const nextContent = currentContent || text.toString();
    db.prepare(`
      UPDATE documents SET ydoc_state=?, content=?, title=?, updated_at=unixepoch()
      WHERE id=?
    `).run(state, nextContent, nextTitle, docId);
  }, 5000);

  // Snapshot every 30 seconds while dirty so history stays useful
  const snapshotInterval = setInterval(() => {
    if (!revisionDirty) return;
    revisionDirty = false;
    const state = Y.encodeStateAsUpdate(ydoc);
    const text = currentContent || ydoc.getText('quill').toString();
    const title = currentTitle || ydoc.getText('title').toString() || 'Untitled';
    const existing = db.prepare('SELECT id FROM documents WHERE id=?').get(docId);
    const signature = `${title}::${text}`;
    if (existing && text.length > 0 && signature !== lastRevisionSignature) {
      db.prepare('INSERT INTO revisions (doc_id, snapshot, content, title) VALUES (?,?,?,?)')
        .run(docId, state, text, title);
      lastRevisionSignature = signature;
    }
  }, 10000);

  const entry = {
    ydoc,
    awareness,
    connections: new Set(),
    persistInterval,
    snapshotInterval,
    get currentContent() {
      return currentContent;
    },
    set currentContent(value) {
      currentContent = value;
    },
    get currentTitle() {
      return currentTitle;
    },
    set currentTitle(value) {
      currentTitle = value;
    },
    markPersistDirty() {
      persistDirty = true;
    },
    markRevisionDirty() {
      revisionDirty = true;
    },
    setLastRevisionSignature(value) {
      lastRevisionSignature = value;
    },
    getLastRevisionSignature() {
      return lastRevisionSignature;
    },
  };
  
  // Real-time synchronization broadcast
  ydoc.on('update', (update, origin) => {
    persistDirty = true;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    entry.connections.forEach(conn => {
      if (conn !== origin && conn.readyState === WebSocket.OPEN) {
        conn.send(message);
      }
    });
  });

  docs.set(docId, entry);
  return entry;
}

function closeDoc(docId) {
  const entry = docs.get(docId);
  if (!entry) return;
  if (entry.connections.size === 0) {
    // Final persist
    const state = Y.encodeStateAsUpdate(entry.ydoc);
    const text = entry.currentContent || entry.ydoc.getText('quill').toString();
    const title = entry.currentTitle || entry.ydoc.getText('title').toString() || 'Untitled';
    db.prepare(`UPDATE documents SET ydoc_state=?, content=?, title=?, updated_at=unixepoch() WHERE id=?`)
      .run(state, text, title, docId);
    const signature = `${title}::${text}`;
    if (text.length > 0 && signature !== entry.getLastRevisionSignature()) {
      db.prepare('INSERT INTO revisions (doc_id, snapshot, content, title) VALUES (?,?,?,?)')
        .run(docId, state, text, title);
      entry.setLastRevisionSignature(signature);
    }
    clearInterval(entry.persistInterval);
    clearInterval(entry.snapshotInterval);
    entry.ydoc.destroy();
    docs.delete(docId);
  }
}

// ─── WebSocket: Yjs Sync + Awareness + Chat ──────────────────────────────────
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_CHAT = 2;
const MESSAGE_CHAT_HISTORY = 3;
const MESSAGE_CONTENT = 4;
const MESSAGE_PRESENCE = 5;

function getPresenceSnapshot(awareness) {
  const users = [];
  awareness.getStates().forEach((state, clientId) => {
    if (state?.name) {
      users.push({
        clientId,
        name: state.name,
        color: state.color || '#5cbce0',
        cursor: state.cursor || null,
      });
    }
  });
  return users;
}

function broadcastPresence(connections, awareness) {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MESSAGE_PRESENCE);
  encoding.writeVarString(enc, JSON.stringify(getPresenceSnapshot(awareness)));
  const msg = encoding.toUint8Array(enc);
  connections.forEach((conn) => {
    if (conn.readyState === WebSocket.OPEN) {
      conn.send(msg);
    }
  });
}

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const docId = url.searchParams.get('docId');
  if (!docId || !isValidUuidLike(docId)) { ws.close(1008, 'Invalid document reference'); return; }

  const doc = db.prepare('SELECT id FROM documents WHERE id=? OR edit_token=?').get(docId, docId);
  if (!doc) { ws.close(1008, 'Not found'); return; }

  const { ydoc, awareness, connections } = getOrCreateDoc(doc.id);
  connections.add(ws);
  ws._docId = doc.id;
  ws._awarenessClientIds = new Set();

  // Send sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, ydoc);
  ws.send(encoding.toUint8Array(encoder));

  // Send awareness
  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const enc2 = encoding.createEncoder();
    encoding.writeVarUint(enc2, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(enc2, awarenessProtocol.encodeAwarenessUpdate(awareness, [...awarenessStates.keys()]));
    ws.send(encoding.toUint8Array(enc2));
  }
  broadcastPresence(connections, awareness);

  // Send recent chat history (last 50 messages)
  const messages = db.prepare(
    'SELECT * FROM chat_messages WHERE doc_id=? ORDER BY created_at DESC LIMIT 50'
  ).all(doc.id).reverse();
  if (messages.length > 0) {
    const enc3 = encoding.createEncoder();
    encoding.writeVarUint(enc3, MESSAGE_CHAT_HISTORY);
    encoding.writeVarString(enc3, JSON.stringify(messages));
    ws.send(encoding.toUint8Array(enc3));
  }

  // Awareness update handler
  const awarenessChangeHandler = ({ added, updated, removed }, origin) => {
    if (origin === ws) return;
    const changedClients = added.concat(updated).concat(removed);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
    const msg = encoding.toUint8Array(enc);
    connections.forEach(conn => { if (conn !== ws && conn.readyState === WebSocket.OPEN) conn.send(msg); });
  };
  awareness.on('change', awarenessChangeHandler);

  // Message handler
  ws.on('message', (data) => {
    try {
      const uint8 = new Uint8Array(data);
      const decoder = decoding.createDecoder(uint8);
      const msgType = decoding.readVarUint(decoder);

      if (msgType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        // Passing `ws` as the transaction origin applies the update and triggers ydoc.on('update') with origin === ws
        const syncMsgType = syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws);

        if (syncMsgType === syncProtocol.messageYjsSyncStep1) {
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
        }
        return;
      }

      if (msgType === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        const awarenessDecoder = decoding.createDecoder(update);
        const updateLen = decoding.readVarUint(awarenessDecoder);
        for (let i = 0; i < updateLen; i += 1) {
          const clientId = decoding.readVarUint(awarenessDecoder);
          ws._awarenessClientIds.add(clientId);
          decoding.readVarUint(awarenessDecoder);
          decoding.readVarString(awarenessDecoder);
        }
        awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(enc, update);
        const msg = encoding.toUint8Array(enc);
        connections.forEach(conn => { if (conn !== ws && conn.readyState === WebSocket.OPEN) conn.send(msg); });
        broadcastPresence(connections, awareness);
        return;
      }

      if (msgType === MESSAGE_CHAT) {
        const parsed = safeJsonParse(decoding.readVarString(decoder));
        const message = String(parsed.data?.message || '').trim();
        const userName = sanitizeTitle(parsed.data?.userName, 'Guest').slice(0, 60);
        const userColor = /^#[0-9a-f]{3,8}$/i.test(String(parsed.data?.userColor || '')) ? parsed.data.userColor : '#5cbce0';
        if (!parsed.ok || !message) return;
        const nextMessage = message.slice(0, MAX_CHAT_MESSAGE_LENGTH);
        db.prepare('INSERT INTO chat_messages (doc_id, user_name, user_color, message) VALUES (?,?,?,?)')
          .run(doc.id, userName, userColor, nextMessage);
        mirrorSafely('Chat mirror', () => mirrorChatMessageToSupabase({
          doc_id: doc.id,
          user_name: userName,
          user_color: userColor,
          message: nextMessage,
        }));
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_CHAT);
        encoding.writeVarString(enc, JSON.stringify({
          userName,
          userColor,
          message: nextMessage,
          created_at: Math.floor(Date.now() / 1000),
        }));
        const msg = encoding.toUint8Array(enc);
        connections.forEach(conn => { if (conn.readyState === WebSocket.OPEN) conn.send(msg); });
        return;
      }

      if (msgType === MESSAGE_CONTENT) {
        const parsed = safeJsonParse(decoding.readVarString(decoder));
        if (!parsed.ok) return;
        const html = sanitizeContent(parsed.data?.html);
        const title = sanitizeTitle(
          parsed.data?.title || docs.get(doc.id)?.currentTitle || db.prepare('SELECT title FROM documents WHERE id=?').get(doc.id)?.title,
          'Untitled',
        );
        const docEntry = docs.get(doc.id);
        if (docEntry) {
          docEntry.currentContent = html;
          docEntry.currentTitle = title;
          docEntry.markPersistDirty();
          docEntry.markRevisionDirty();
        }
        db.prepare('UPDATE documents SET content=?, title=?, updated_at=unixepoch() WHERE id=?')
          .run(html, title, doc.id);
        const currentDoc = db.prepare('SELECT id, owner_id, edit_token, view_token FROM documents WHERE id=?').get(doc.id);
        mirrorSafely('Document mirror', () => mirrorDocumentToSupabase({
          ...currentDoc,
          title,
          content: html,
        }));

        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_CONTENT);
        encoding.writeVarString(enc, JSON.stringify({
          html,
          updated_at: Math.floor(Date.now() / 1000),
        }));
        const msg = encoding.toUint8Array(enc);
        connections.forEach(conn => { if (conn !== ws && conn.readyState === WebSocket.OPEN) conn.send(msg); });
      }
    } catch (error) {
      console.warn('WebSocket message handling failed:', error?.message || error);
    }
  });

  ws.on('error', (error) => {
    console.warn('WebSocket connection error:', error?.message || error);
  });

  ws.on('close', () => {
    if (ws._awarenessClientIds?.size) {
      const ids = [...ws._awarenessClientIds];
      awarenessProtocol.removeAwarenessStates(awareness, ids, ws);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, ids));
      const msg = encoding.toUint8Array(enc);
      connections.forEach((conn) => {
        if (conn !== ws && conn.readyState === WebSocket.OPEN) conn.send(msg);
      });
    }
    awareness.off('change', awarenessChangeHandler);
    connections.delete(ws);
    broadcastPresence(connections, awareness);
    setTimeout(() => closeDoc(doc.id), 30000);
  });
});

// ─── REST API ─────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) return res.status(409).json({ error: 'Account already exists' });

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?,?,?)')
      .run(id, email, passwordHash);

    const user = { id, email };
    await mirrorSafely('User mirror', () => mirrorUserToSupabase(user));
    res.json({ token: createToken(user), user });
  } catch (error) {
    reportServerError(res, error, 'Unable to create account right now');
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email=?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) return res.status(401).json({ error: 'Invalid email or password' });

    res.json({
      token: createToken(user),
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    reportServerError(res, error, 'Unable to sign in right now');
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id=?').get(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (error) {
    reportServerError(res, error, 'Unable to load your session');
  }
});

// List documents
app.get('/api/docs', authRequired, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, title, edit_token, view_token, created_at, updated_at
      FROM documents
      WHERE owner_id = ?
      ORDER BY updated_at DESC
    `).all(req.user.sub);
    res.json(rows);
  } catch (error) {
    reportServerError(res, error, 'Unable to load documents');
  }
});

// Create document
app.post('/api/docs', authRequired, async (req, res) => {
  try {
    const id = uuidv4();
    const editToken = uuidv4();
    const viewToken = uuidv4();
    const title = sanitizeTitle(req.body?.title, 'Untitled');
    db.prepare('INSERT INTO documents (id, owner_id, edit_token, view_token, title) VALUES (?,?,?,?,?)')
      .run(id, req.user.sub, editToken, viewToken, title);
    const doc = { id, owner_id: req.user.sub, edit_token: editToken, view_token: viewToken, title };
    await mirrorSafely('Document mirror', () => mirrorDocumentToSupabase(doc));
    res.json({ id, edit_token: editToken, view_token: viewToken, title });
  } catch (error) {
    reportServerError(res, error, 'Unable to create the document');
  }
});

// Get document by id or token
app.get('/api/docs/:token', (req, res) => {
  try {
    const { token } = req.params;
    if (!isValidUuidLike(token)) {
      return res.status(400).json({ error: 'Invalid document reference' });
    }
    const row = db.prepare('SELECT id, title, edit_token, view_token, content, created_at, updated_at FROM documents WHERE id=? OR edit_token=? OR view_token=?')
      .get(token, token, token);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const isView = row.view_token === token;
    res.json({ ...row, readonly: isView });
  } catch (error) {
    reportServerError(res, error, 'Unable to load the document');
  }
});

// Update document title
app.patch('/api/docs/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body || {};
    if (!isValidUuidLike(id)) {
      return res.status(400).json({ error: 'Invalid document id' });
    }
    if (typeof title !== 'string' && typeof content !== 'string') {
      return res.status(400).json({ error: 'Provide a title or content value to update' });
    }
    const doc = db.prepare('SELECT id, owner_id, edit_token, view_token FROM documents WHERE id=?').get(id);
    if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
    const current = db.prepare('SELECT title, content FROM documents WHERE id=?').get(id);
    const nextTitle = typeof title === 'string' ? sanitizeTitle(title, current?.title || 'Untitled') : current?.title;
    const nextContent = typeof content === 'string' ? sanitizeContent(content) : current?.content;
    db.prepare('UPDATE documents SET title=?, content=?, updated_at=unixepoch() WHERE id=?').run(nextTitle, nextContent, id);
    const liveDoc = docs.get(id);
    if (liveDoc) {
      liveDoc.currentTitle = nextTitle || 'Untitled';
      liveDoc.currentContent = nextContent || '';
      liveDoc.markPersistDirty();
      if (typeof content === 'string') {
        liveDoc.markRevisionDirty();
      }
    }
    await mirrorSafely('Document mirror', () => mirrorDocumentToSupabase({ ...doc, title: nextTitle, content: nextContent }));
    res.json({ ok: true });
  } catch (error) {
    reportServerError(res, error, 'Unable to update the document');
  }
});

// Delete document
app.delete('/api/docs/:id', authRequired, (req, res) => {
  try {
    if (!isValidUuidLike(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document id' });
    }
    const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id=?').get(req.params.id);
    if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM documents WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    reportServerError(res, error, 'Unable to delete the document');
  }
});

// Get revisions
app.get('/api/docs/:id/revisions', authRequired, (req, res) => {
  try {
    if (!isValidUuidLike(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document id' });
    }
    const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id=?').get(req.params.id);
    if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
    const rows = db.prepare('SELECT id, title, content, created_at FROM revisions WHERE doc_id=? ORDER BY created_at DESC')
      .all(req.params.id);
    res.json(rows);
  } catch (error) {
    reportServerError(res, error, 'Unable to load revisions');
  }
});

app.get('/api/docs/:id/revisions/:revId', authRequired, (req, res) => {
  try {
    if (!isValidUuidLike(req.params.id) || !/^\d+$/.test(String(req.params.revId))) {
      return res.status(400).json({ error: 'Invalid revision reference' });
    }
    const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id=?').get(req.params.id);
    if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
    const revision = db.prepare('SELECT id, title, content, created_at FROM revisions WHERE id=? AND doc_id=?')
      .get(req.params.revId, req.params.id);
    if (!revision) return res.status(404).json({ error: 'Not found' });
    res.json({ revision });
  } catch (error) {
    reportServerError(res, error, 'Unable to load that revision');
  }
});

// Restore revision
app.post('/api/docs/:id/revisions/:revId/restore', authRequired, async (req, res) => {
  try {
    if (!isValidUuidLike(req.params.id) || !/^\d+$/.test(String(req.params.revId))) {
      return res.status(400).json({ error: 'Invalid revision reference' });
    }
    const doc = db.prepare('SELECT id, owner_id, edit_token, view_token FROM documents WHERE id=?').get(req.params.id);
    if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
    const rev = db.prepare('SELECT * FROM revisions WHERE id=? AND doc_id=?').get(req.params.revId, req.params.id);
    if (!rev) return res.status(404).json({ error: 'Not found' });

    const restoredState = encodeDocStateFromContent(rev.content, rev.title);
    const docEntry = docs.get(req.params.id);

    if (docEntry) {
      docEntry.currentTitle = rev.title || 'untitled';
      docEntry.currentContent = rev.content || '';
      docEntry.markPersistDirty();
      docEntry.ydoc.transact(() => {
        const ytext = docEntry.ydoc.getText('quill');
        const ytitle = docEntry.ydoc.getText('title');
        ytext.delete(0, ytext.length);
        ytitle.delete(0, ytitle.length);
        ytext.insert(0, rev.content || '');
        ytitle.insert(0, rev.title || 'untitled');
      }, 'restore');

      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_CONTENT);
      encoding.writeVarString(enc, JSON.stringify({
        html: rev.content || '',
        updated_at: Math.floor(Date.now() / 1000),
        restored_from_revision_id: req.params.revId,
      }));
      const message = encoding.toUint8Array(enc);
      docEntry.connections.forEach((conn) => {
        if (conn.readyState === WebSocket.OPEN) {
          conn.send(message);
        }
      });
    }
    db.prepare('UPDATE documents SET ydoc_state=?, content=?, title=?, updated_at=unixepoch() WHERE id=?')
      .run(restoredState, rev.content, rev.title, req.params.id);
    db.prepare('INSERT INTO revisions (doc_id, snapshot, content, title) VALUES (?,?,?,?)')
      .run(req.params.id, restoredState, rev.content || '', rev.title || 'untitled');
    docEntry?.setLastRevisionSignature(`${rev.title || 'untitled'}::${rev.content || ''}`);
    await mirrorSafely('Document mirror', () => mirrorDocumentToSupabase({ ...doc, title: rev.title, content: rev.content }));
    res.json({ ok: true });
  } catch (error) {
    reportServerError(res, error, 'Unable to restore that revision');
  }
});

// AI: Analyze / summarize text (SSE stream)
app.post('/api/ai/command', async (req, res) => {
  if (!ensureGroqConfigured(res)) return;
  const instruction = String(req.body?.instruction || '').trim().slice(0, 2000);
  const selectionText = String(req.body?.selectionText || '').trim();
  const documentText = String(req.body?.documentText || '').slice(0, 20000);

  if (!instruction) return res.status(400).json({ error: 'instruction is required' });

  try {
    const completion = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: 'user', content: buildAiCommandPrompt(instruction, selectionText, documentText) }],
      temperature: 0.5,
      max_tokens: 1024,
      stream: false,
    });

    const output = completion.choices?.[0]?.message?.content?.trim() || '';
    if (!output) {
      return res.status(502).json({ error: 'Groq returned empty output.' });
    }

    res.json({ output, model: AI_MODEL });
  } catch (err) {
    res.status(err?.status || 500).json({ error: err.message || 'AI command failed', model: AI_MODEL });
  }
});

app.post('/api/ai/analyze', async (req, res) => {
  if (!ensureGroqConfigured(res)) return;
  const text = String(req.body?.text || '').trim();
  const action = String(req.body?.action || '').trim();
  if (!text || !action) return res.status(400).json({ error: 'text and action required' });

  const prompts = {
    summarize: `Summarize this text concisely in a few sentences. Return ONLY the summary, no preamble:\n\n${text}`,
    explain: `Explain this text simply as if to a beginner. Return ONLY the explanation:\n\n${text}`,
    improve: `Improve the clarity and flow of this text while keeping the exact same meaning. Return ONLY the improved text, no preamble or explanation:\n\n${text}`,
    professional: `Rewrite this text in a more professional, polished, and concise tone while preserving the core meaning. Return ONLY the rewritten text, no preamble or explanation:\n\n${text}`,
    translate: `Translate this text to Spanish. Return ONLY the translation:\n\n${text}`,
    bullets: `Convert this text into a clear, concise bulleted list using '- ' for each bullet. Return ONLY the bullet list, no intro text:\n\n${text}`,
    table: `Convert the following data/text into a well-formatted markdown table with headers. Return ONLY the markdown table:\n\n${text}`,
    highlight: `Identify the single most important sentence in the text and return it exactly as written:\n\n${text}`,
    continue: `You are an AI writing assistant. Continue the following text naturally with 1-2 sentences that fit the style and topic. Return ONLY the continuation text, no preamble, no quotation marks:\n\n${text}`,
  };

  const prompt = prompts[action] || `${action.slice(0, 120)}:\n\n${text.slice(0, 20000)}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message || 'AI analyze failed', model: AI_MODEL })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

app.post('/api/ai/autocomplete', async (req, res) => {
  if (!ensureGroqConfigured(res)) return;
  const documentText = String(req.body?.documentText || '').trim();
  if (!documentText) {
    return res.status(400).json({ error: 'documentText is required' });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: [
            'You are an AI writing assistant providing ghost text autocomplete.',
            'Given the text before the cursor, suggest only the next few words or continuation.',
            'Rules:',
            '- Return ONLY the completion text.',
            '- DO NOT repeat the input text.',
            '- DO NOT use markdown.',
            '- Keep it short, ideally under 15 words.',
            '- Match the existing tone and style exactly.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: documentText,
        },
      ],
      temperature: 0.1,
      max_tokens: 64,
      stream: false,
    });

    const output = completion.choices?.[0]?.message?.content?.trim() || '';
    res.json({ output, model: AI_MODEL });
  } catch (err) {
    res.status(err?.status || 500).json({ error: err.message || 'Autocomplete failed', model: AI_MODEL });
  }
});

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, docs: docs.size }));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Unexpected server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✓ Collab server running on http://localhost:${PORT}`));
