const BASE = '/api'
const TOKEN_KEY = 'livedraft-token'
const USER_KEY = 'livedraft-user'

function notifyDocsChanged() {
  window.dispatchEvent(new CustomEvent('docs-updated'))
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch (_) {
    return null
  }
}

function setStoredUser(user) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_KEY)
  }
}

function authHeaders(extra = {}) {
  const token = getAuthToken()
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function parseJson(r) {
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export async function signUp(email, password) {
  const r = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await parseJson(r)
  setAuthToken(data.token)
  setStoredUser(data.user)
  return data
}

export async function signIn(email, password) {
  const r = await fetch(`${BASE}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await parseJson(r)
  setAuthToken(data.token)
  setStoredUser(data.user)
  return data
}

export async function getSessionUser() {
  const r = await fetch(`${BASE}/auth/me`, {
    headers: authHeaders(),
  })
  const data = await parseJson(r)
  setStoredUser(data.user)
  return data
}

export function signOut() {
  setAuthToken(null)
  setStoredUser(null)
}

export async function listDocs() {
  const r = await fetch(`${BASE}/docs`, {
    headers: authHeaders(),
  })
  return parseJson(r)
}

export async function createDoc(title = 'Untitled') {
  const r = await fetch(`${BASE}/docs`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  })
  const doc = await parseJson(r)
  notifyDocsChanged()
  return doc
}

export async function getDoc(token) {
  const r = await fetch(`${BASE}/docs/${token}`)
  if (!r.ok) throw new Error('Document not found')
  return r.json()
}

export async function deleteDoc(id) {
  const r = await fetch(`${BASE}/docs/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  await parseJson(r)
  notifyDocsChanged()
}

export async function getRevisions(id) {
  const r = await fetch(`${BASE}/docs/${id}/revisions`, {
    headers: authHeaders(),
  })
  if (!r.ok) return []
  return r.json()
}

export async function restoreRevision(docId, revId) {
  const r = await fetch(`${BASE}/docs/${docId}/revisions/${revId}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  })
  return parseJson(r)
}

export async function updateDocTitle(id, title) {
  const r = await fetch(`${BASE}/docs/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  })
  return parseJson(r)
}

export async function updateDocContent(id, content) {
  const r = await fetch(`${BASE}/docs/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content }),
  })
  return parseJson(r)
}

export async function streamAI(text, action, onChunk, signal) {
  const r = await fetch(`${BASE}/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, action }),
    signal,
  })
  if (!r.ok || !r.body) throw new Error('AI request failed')
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') return
      try {
        const parsed = JSON.parse(payload)
        if (parsed.text) onChunk(parsed.text)
      } catch (_) {}
    }
  }
}
