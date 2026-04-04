const BASE = '/api'

export async function listDocs() {
  const r = await fetch(`${BASE}/docs`)
  if (!r.ok) throw new Error('Failed to fetch documents')
  return r.json()
}

export async function createDoc(title = 'Untitled') {
  const r = await fetch(`${BASE}/docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!r.ok) throw new Error('Failed to create document')
  return r.json()
}

export async function getDoc(token) {
  const r = await fetch(`${BASE}/docs/${token}`)
  if (!r.ok) throw new Error('Document not found')
  return r.json()
}

export async function deleteDoc(id) {
  await fetch(`${BASE}/docs/${id}`, { method: 'DELETE' })
}

export async function getRevisions(id) {
  const r = await fetch(`${BASE}/docs/${id}/revisions`)
  if (!r.ok) return []
  return r.json()
}

export async function restoreRevision(docId, revId) {
  const r = await fetch(`${BASE}/docs/${docId}/revisions/${revId}/restore`, { method: 'POST' })
  return r.json()
}

export async function streamAI(text, action, onChunk) {
  const r = await fetch(`${BASE}/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, action }),
  })
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
