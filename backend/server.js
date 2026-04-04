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
import * as map from 'lib0/map';
import Anthropic from '@anthropic-ai/sdk';
import db from './db.js';

const app = express();
const server = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ─── Anthropic Client ────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

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

  // Snapshot every 2 minutes
  const snapshotInterval = setInterval(() => {
    const state = Y.encodeStateAsUpdate(ydoc);
    const text = ydoc.getText('quill').toString();
    const title = ydoc.getText('title').toString() || 'Untitled';
    const existing = db.prepare('SELECT id FROM documents WHERE id=?').get(docId);
    if (existing && text.length > 0) {
      db.prepare('INSERT INTO revisions (doc_id, snapshot, content, title) VALUES (?,?,?,?)')
        .run(docId, state, text, title);
      // Keep only last 30 revisions
      db.prepare(`DELETE FROM revisions WHERE doc_id=? AND id NOT IN (
        SELECT id FROM revisions WHERE doc_id=? ORDER BY created_at DESC LIMIT 30
      )`).run(docId, docId);
    }
  }, 120000);

  const entry = { ydoc, awareness, connections: new Set(), persistInterval, snapshotInterval };
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
      const syncMsgType = syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws);
      if (syncMsgType === syncProtocol.messageYjsSyncStep1) {
        ws.send(encoding.toUint8Array(encoder));
      } else if (encoding.length(encoder) > 1) {
        // Broadcast update to all other connections
        const msg = encoding.toUint8Array(encoder);
        connections.forEach(conn => { if (conn !== ws && conn.readyState === WebSocket.OPEN) conn.send(msg); });
        // Also send back for confirmation
        ws.send(msg);
      }
    } else if (msgType === MESSAGE_AWARENESS) {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
    } else if (msgType === MESSAGE_CHAT) {
      const payload = JSON.parse(decoding.readVarString(decoder));
      // Persist
      db.prepare('INSERT INTO chat_messages (doc_id, user_name, user_color, message) VALUES (?,?,?,?)')
        .run(doc.id, payload.userName, payload.userColor, payload.message);
      // Broadcast to all (including sender)
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_CHAT);
      encoding.writeVarString(enc, JSON.stringify({ ...payload, created_at: Math.floor(Date.now() / 1000) }));
      const msg = encoding.toUint8Array(enc);
      connections.forEach(conn => { if (conn.readyState === WebSocket.OPEN) conn.send(msg); });
    }
  });

  ws.on('close', () => {
    awareness.off('change', awarenessChangeHandler);
    awarenessProtocol.removeAwarenessStates(awareness, [ydoc.clientID], null);
    connections.delete(ws);
    setTimeout(() => closeDoc(doc.id), 30000);
  });
});

// ─── REST API ─────────────────────────────────────────────────────────────────

// List documents
app.get('/api/docs', (req, res) => {
  const rows = db.prepare('SELECT id, title, edit_token, view_token, created_at, updated_at FROM documents ORDER BY updated_at DESC').all();
  res.json(rows);
});

// Create document
app.post('/api/docs', (req, res) => {
  const id = uuidv4();
  const editToken = uuidv4();
  const viewToken = uuidv4();
  const title = req.body?.title || 'Untitled';
  db.prepare('INSERT INTO documents (id, edit_token, view_token, title) VALUES (?,?,?,?)')
    .run(id, editToken, viewToken, title);
  res.json({ id, editToken, viewToken, title });
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
app.patch('/api/docs/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  db.prepare('UPDATE documents SET title=?, updated_at=unixepoch() WHERE id=?').run(title, id);
  res.json({ ok: true });
});

// Delete document
app.delete('/api/docs/:id', (req, res) => {
  db.prepare('DELETE FROM documents WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Get revisions
app.get('/api/docs/:id/revisions', (req, res) => {
  const rows = db.prepare('SELECT id, title, content, created_at FROM revisions WHERE doc_id=? ORDER BY created_at DESC')
    .all(req.params.id);
  res.json(rows);
});

// Restore revision
app.post('/api/docs/:id/revisions/:revId/restore', (req, res) => {
  const rev = db.prepare('SELECT * FROM revisions WHERE id=? AND doc_id=?').get(req.params.revId, req.params.id);
  if (!rev) return res.status(404).json({ error: 'Not found' });

  const docEntry = docs.get(req.params.id);
  if (docEntry) {
    // Apply snapshot to live doc
    Y.applyUpdate(docEntry.ydoc, rev.snapshot);
  }
  db.prepare('UPDATE documents SET ydoc_state=?, content=?, title=?, updated_at=unixepoch() WHERE id=?')
    .run(rev.snapshot, rev.content, rev.title, req.params.id);
  res.json({ ok: true });
});

// AI: Analyze / summarize text (SSE stream)
app.post('/api/ai/analyze', async (req, res) => {
  const { text, action } = req.body;
  if (!text || !action) return res.status(400).json({ error: 'text and action required' });

  const prompts = {
    summarize: `Please summarize the following text concisely:\n\n${text}`,
    explain: `Please explain the following text in simple terms:\n\n${text}`,
    improve: `Please improve the writing quality of the following text while preserving the original meaning:\n\n${text}`,
    translate: `Please translate the following text to Spanish:\n\n${text}`,
    bullets: `Please convert the following text into clear bullet points:\n\n${text}`,
  };

  const prompt = prompts[action] || `${action}:\n\n${text}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
      // Demo mode
      const demo = `[AI Demo] This is a mock AI response for: "${action}". Connect an Anthropic API key in backend/.env to enable real AI features.`;
      for (const char of demo) {
        res.write(`data: ${JSON.stringify({ text: char })}\n\n`);
        await new Promise(r => setTimeout(r, 20));
      }
    } else {
      const stream = await anthropic.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
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
