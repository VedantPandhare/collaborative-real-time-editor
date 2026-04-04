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

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ─── Groq Client ────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
  const row = db.prepare('SELECT ydoc_state FROM documents WHERE id = ?').get(docId);
  if (row?.ydoc_state) {
    try { Y.applyUpdate(ydoc, row.ydoc_state); } catch (_) {}
  }

  // Auto-persist every 5 seconds when dirty
  let dirty = false;
  ydoc.on('update', () => { dirty = true; });

  const persistInterval = setInterval(() => {
    if (!dirty) return;
    dirty = false;
    const state = Y.encodeStateAsUpdate(ydoc);
    const text = ydoc.getText('quill');
    const title = ydoc.getText('title');
    db.prepare(`
      UPDATE documents SET ydoc_state=?, content=?, title=?, updated_at=unixepoch()
      WHERE id=?
    `).run(state, text.toString(), title.toString() || 'Untitled', docId);
  }, 5000);

  // Snapshot every 30 seconds while dirty so history stays useful
  const snapshotInterval = setInterval(() => {
    if (!dirty) return;
    dirty = false;
    const state = Y.encodeStateAsUpdate(ydoc);
    const text = ydoc.getText('quill').toString();
    const title = ydoc.getText('title').toString() || 'Untitled';
    const existing = db.prepare('SELECT id FROM documents WHERE id=?').get(docId);
    if (existing && text.length > 0) {
      db.prepare('INSERT INTO revisions (doc_id, snapshot, content, title) VALUES (?,?,?,?)')
        .run(docId, state, text, title);
    }
  }, 30000);

  const entry = { ydoc, awareness, connections: new Set(), persistInterval, snapshotInterval };
  
  // Real-time synchronization broadcast
  ydoc.on('update', (update, origin) => {
    dirty = true;
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
    const text = entry.ydoc.getText('quill').toString();
    const title = entry.ydoc.getText('title').toString() || 'Untitled';
    db.prepare(`UPDATE documents SET ydoc_state=?, content=?, title=?, updated_at=unixepoch() WHERE id=?`)
      .run(state, text, title, docId);
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

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const docId = url.searchParams.get('docId');
  if (!docId) { ws.close(); return; }

  const doc = db.prepare('SELECT id FROM documents WHERE id=? OR edit_token=?').get(docId, docId);
  if (!doc) { ws.close(1008, 'Not found'); return; }

  const { ydoc, awareness, connections } = getOrCreateDoc(doc.id);
  connections.add(ws);
  ws._docId = doc.id;

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
    const uint8 = new Uint8Array(data);
    const decoder = decoding.createDecoder(uint8);
    const msgType = decoding.readVarUint(decoder);

    if (msgType === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      // Passing `ws` as the transaction origin applies the update and triggers ydoc.on('update') with origin === ws
      const syncMsgType = syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws);
      
      if (syncMsgType === syncProtocol.messageYjsSyncStep1) {
        // SyncStep1: Send back SyncStep2 (the missing updates)
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }
      }
      // Note: syncProtocol.messageYjsSyncStep2 and messageYjsSyncUpdate are automatically 
      // broadcasted via the ydoc.on('update') listener in getOrCreateDoc.
    } else if (msgType === MESSAGE_AWARENESS) {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
      // Broadcast awareness to everyone else
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(enc, update);
      const msg = encoding.toUint8Array(enc);
      connections.forEach(conn => { if (conn !== ws && conn.readyState === WebSocket.OPEN) conn.send(msg); });
    } else if (msgType === MESSAGE_CHAT) {
      const payload = JSON.parse(decoding.readVarString(decoder));
      // Persist
      db.prepare('INSERT INTO chat_messages (doc_id, user_name, user_color, message) VALUES (?,?,?,?)')
        .run(doc.id, payload.userName, payload.userColor, payload.message);
      mirrorChatMessageToSupabase({
        doc_id: doc.id,
        user_name: payload.userName,
        user_color: payload.userColor,
        message: payload.message,
      }).catch(() => {});
      // Broadcast to all (including sender)
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_CHAT);
      encoding.writeVarString(enc, JSON.stringify({ ...payload, created_at: Math.floor(Date.now() / 1000) }));
      const msg = encoding.toUint8Array(enc);
      connections.forEach(conn => { if (conn.readyState === WebSocket.OPEN) conn.send(msg); });
    } else if (msgType === MESSAGE_CONTENT) {
      const payload = JSON.parse(decoding.readVarString(decoder));
      const title = payload.title || db.prepare('SELECT title FROM documents WHERE id=?').get(doc.id)?.title || 'Untitled';
      db.prepare('UPDATE documents SET content=?, title=?, updated_at=unixepoch() WHERE id=?')
        .run(payload.html || '', title, doc.id);
      const currentDoc = db.prepare('SELECT id, owner_id, edit_token, view_token FROM documents WHERE id=?').get(doc.id);
      mirrorDocumentToSupabase({
        ...currentDoc,
        title,
        content: payload.html || '',
      }).catch(() => {});

      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_CONTENT);
      encoding.writeVarString(enc, JSON.stringify({
        html: payload.html || '',
        updated_at: Math.floor(Date.now() / 1000),
      }));
      const msg = encoding.toUint8Array(enc);
      connections.forEach(conn => { if (conn !== ws && conn.readyState === WebSocket.OPEN) conn.send(msg); });
    }
  });

  ws.on('close', () => {
    awareness.off('change', awarenessChangeHandler);
    connections.delete(ws);
    setTimeout(() => closeDoc(doc.id), 30000);
  });
});

// ─── REST API ─────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
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
  await mirrorUserToSupabase(user).catch(() => {});
  res.json({ token: createToken(user), user });
});

app.post('/api/auth/signin', async (req, res) => {
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
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id=?').get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// List documents
app.get('/api/docs', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT id, title, edit_token, view_token, created_at, updated_at
    FROM documents
    WHERE owner_id = ?
    ORDER BY updated_at DESC
  `).all(req.user.sub);
  res.json(rows);
});

// Create document
app.post('/api/docs', authRequired, async (req, res) => {
  const id = uuidv4();
  const editToken = uuidv4();
  const viewToken = uuidv4();
  const title = req.body?.title || 'untitled';
  db.prepare('INSERT INTO documents (id, owner_id, edit_token, view_token, title) VALUES (?,?,?,?,?)')
    .run(id, req.user.sub, editToken, viewToken, title);
  const doc = { id, owner_id: req.user.sub, edit_token: editToken, view_token: viewToken, title };
  await mirrorDocumentToSupabase(doc).catch(() => {});
  res.json({ id, edit_token: editToken, view_token: viewToken, title });
});

// Get document by id or token
app.get('/api/docs/:token', (req, res) => {
  const { token } = req.params;
  const row = db.prepare('SELECT id, title, edit_token, view_token, content, created_at, updated_at FROM documents WHERE id=? OR edit_token=? OR view_token=?')
    .get(token, token, token);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const isView = row.view_token === token;
  res.json({ ...row, readonly: isView });
});

// Update document title
app.patch('/api/docs/:id', authRequired, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const doc = db.prepare('SELECT id, owner_id, edit_token, view_token FROM documents WHERE id=?').get(id);
  if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  const current = db.prepare('SELECT title, content FROM documents WHERE id=?').get(id);
  const nextTitle = typeof title === 'string' ? title : current?.title;
  const nextContent = typeof content === 'string' ? content : current?.content;
  db.prepare('UPDATE documents SET title=?, content=?, updated_at=unixepoch() WHERE id=?').run(nextTitle, nextContent, id);
  await mirrorDocumentToSupabase({ ...doc, title: nextTitle, content: nextContent }).catch(() => {});
  res.json({ ok: true });
});

// Delete document
app.delete('/api/docs/:id', authRequired, (req, res) => {
  const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id=?').get(req.params.id);
  if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM documents WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Get revisions
app.get('/api/docs/:id/revisions', authRequired, (req, res) => {
  const doc = db.prepare('SELECT id, owner_id FROM documents WHERE id=?').get(req.params.id);
  if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare('SELECT id, title, content, created_at FROM revisions WHERE doc_id=? ORDER BY created_at DESC')
    .all(req.params.id);
  res.json(rows);
});

// Restore revision
app.post('/api/docs/:id/revisions/:revId/restore', authRequired, async (req, res) => {
  const doc = db.prepare('SELECT id, owner_id, edit_token, view_token FROM documents WHERE id=?').get(req.params.id);
  if (!doc || doc.owner_id !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  const rev = db.prepare('SELECT * FROM revisions WHERE id=? AND doc_id=?').get(req.params.revId, req.params.id);
  if (!rev) return res.status(404).json({ error: 'Not found' });

  const restoredState = encodeDocStateFromContent(rev.content, rev.title);

  const docEntry = docs.get(req.params.id);
  if (docEntry) {
    docEntry.ydoc.transact(() => {
      const ytext = docEntry.ydoc.getText('quill');
      const ytitle = docEntry.ydoc.getText('title');
      ytext.delete(0, ytext.length);
      ytitle.delete(0, ytitle.length);
      ytext.insert(0, rev.content || '');
      ytitle.insert(0, rev.title || 'untitled');
    }, 'restore');
  }
  db.prepare('UPDATE documents SET ydoc_state=?, content=?, title=?, updated_at=unixepoch() WHERE id=?')
    .run(restoredState, rev.content, rev.title, req.params.id);
  await mirrorDocumentToSupabase({ ...doc, title: rev.title, content: rev.content }).catch(() => {});
  res.json({ ok: true });
});

// AI: Analyze / summarize text (SSE stream)
app.post('/api/ai/analyze', async (req, res) => {
  const { text, action } = req.body;
  if (!text || !action) return res.status(400).json({ error: 'text and action required' });

  const prompts = {
    summarize: `Summarize this text concisely in a few sentences. Return ONLY the summary, no preamble:\n\n${text}`,
    explain: `Explain this text simply as if to a beginner. Return ONLY the explanation:\n\n${text}`,
    improve: `Improve the clarity and flow of this text while keeping the exact same meaning. Return ONLY the improved text, no preamble or explanation:\n\n${text}`,
    translate: `Translate this text to Spanish. Return ONLY the translation:\n\n${text}`,
    bullets: `Convert this text into a clear, concise bulleted list using '- ' for each bullet. Return ONLY the bullet list, no intro text:\n\n${text}`,
    table: `Convert the following data/text into a well-formatted markdown table with headers. Return ONLY the markdown table:\n\n${text}`,
    highlight: `Identify the single most important sentence in the text and return it exactly as written:\n\n${text}`,
    continue: `You are an AI writing assistant. Continue the following text naturally with 1-2 sentences that fit the style and topic. Return ONLY the continuation text, no preamble, no quotation marks:\n\n${text}`,
  };

  const prompt = prompts[action] || `${action}:\n\n${text}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await groq.chat.completions.create({
      model: 'llama3-70b-8192',
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
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, docs: docs.size }));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✓ Collab server running on http://localhost:${PORT}`));
