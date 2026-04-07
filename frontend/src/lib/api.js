const BASE = '/api'
const TOKEN_KEY = 'livedraft-token'
const USER_KEY = 'livedraft-user'

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

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
  if (!r.ok) throw new ApiError(data.error || 'Request failed', r.status)
  return data
}

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, options)
    return await parseJson(response)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (error instanceof ApiError) throw error
    throw new ApiError('Unable to reach the server. Check your connection and try again.')
  }
}

export async function signUp(email, password) {
  const data = await requestJson(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  setAuthToken(data.token)
  setStoredUser(data.user)
  return data
}

export async function signIn(email, password) {
  const data = await requestJson(`${BASE}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  setAuthToken(data.token)
  setStoredUser(data.user)
  return data
}

export async function getSessionUser() {
  const data = await requestJson(`${BASE}/auth/me`, {
    headers: authHeaders(),
  })
  setStoredUser(data.user)
  return data
}

export function signOut() {
  setAuthToken(null)
  setStoredUser(null)
}

export async function listDocs() {
  return requestJson(`${BASE}/docs`, {
    headers: authHeaders(),
  })
}

export async function createDoc(title = 'Untitled') {
  const doc = await requestJson(`${BASE}/docs`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  })
  notifyDocsChanged()
  return doc
}

export async function getDoc(token) {
  return requestJson(`${BASE}/docs/${token}`)
}

export async function deleteDoc(id) {
  await requestJson(`${BASE}/docs/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  notifyDocsChanged()
}

export async function getRevisions(id) {
  return requestJson(`${BASE}/docs/${id}/revisions`, {
    headers: authHeaders(),
  })
}

export async function getRevision(docId, revId) {
  return requestJson(`${BASE}/docs/${docId}/revisions/${revId}`, {
    headers: authHeaders(),
  })
}

export async function restoreRevision(docId, revId) {
  return requestJson(`${BASE}/docs/${docId}/revisions/${revId}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  })
}

export async function updateDocTitle(id, title) {
  return requestJson(`${BASE}/docs/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  })
}

export async function updateDocContent(id, content) {
  return requestJson(`${BASE}/docs/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content }),
  })
}

export async function streamAI(text, action, onChunk, signal) {
  const r = await fetch(`${BASE}/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, action }),
    signal,
  })
  if (!r.ok || !r.body) {
    const data = await r.json().catch(() => ({}))
    throw new ApiError(data.error || 'AI request failed', r.status)
  }
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
        if (parsed.error) {
          throw new Error(parsed.error)
        }
        if (parsed.text) onChunk(parsed.text)
      } catch (error) {
        if (error instanceof Error) throw error
      }
    }
  }
}

export async function fetchAiAutocomplete(documentText, signal) {
  const data = await requestJson(`${BASE}/ai/autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentText }),
    signal,
  })
  return data.output || ''
}

export async function aiCommand(instruction, selectionText = '', documentText = '') {
  const data = await requestJson(`${BASE}/ai/command`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ instruction, selectionText, documentText }),
  })
  return data.output || ''
}
