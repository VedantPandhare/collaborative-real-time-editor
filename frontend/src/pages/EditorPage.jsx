import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, MessageSquare, Sparkles, Clock, Eye,
} from 'lucide-react'
import { getDoc } from '../lib/api'
import { setLocalUser } from '../lib/colors'
import { useCollabEditor } from '../hooks/useCollabEditor'
import PresenceBar from '../components/PresenceBar'
import Toolbar from '../components/Toolbar'
import ChatPanel from '../components/ChatPanel'
import RevisionPanel from '../components/RevisionPanel'
import RemoteCursors from '../components/RemoteCursors'
import SlashMenu from '../components/SlashMenu'
import ExportMenu from '../components/ExportMenu'

const PANEL = { CHAT: 'chat', HISTORY: 'history', NONE: null }

// ── SSE streaming helper ──────────────────────────────────────────────────────
async function streamAI(text, action, onChunk) {
  const res = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, action }),
  })
  if (!res.ok) throw new Error(`AI error ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() // keep incomplete line
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        const { text: t } = JSON.parse(payload)
        if (t) onChunk(t)
      } catch (_) {}
    }
  }
}

export default function EditorPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [panel, setPanel] = useState(PANEL.NONE)
  const [focusMode, setFocusMode] = useState(false)
  const [title, setTitle] = useState('Untitled')
  const [chatMessages, setChatMessages] = useState([])
  const [isAiLoading, setIsAiLoading] = useState(false)

  // Ghost-text autocomplete state
  const [ghostText, setGhostText] = useState('')
  const [ghostPos, setGhostPos] = useState({ top: 0, left: 0 })
  const ghostCursorIndexRef = useRef(null) // index where ghost text starts
  const autocompleteTimerRef = useRef(null)
  const isAutocompleting = useRef(false)
  const abortControllerRef = useRef(null)

  // Slash menu state
  const [slashMenu, setSlashMenu] = useState({ visible: false, x: 0, y: 0, query: '' })

  const editorContainerRef = useRef(null)

  // ── Chat handlers ─────────────────────────────────────────────────────────
  const onChatMessage = useCallback((msg) => setChatMessages(prev => [...prev, msg]), [])
  const onChatHistory = useCallback((history) => setChatMessages(history), [])

  // ── Collab hook ───────────────────────────────────────────────────────────
  const { connected, users, sendChat, updateLocalUser, getYdoc, getQuill } = useCollabEditor({
    docId: doc?.id,
    containerRef: editorContainerRef,
    readonly: false,
    onChatMessage,
    onChatHistory,
  })

  // ── Load doc ──────────────────────────────────────────────────────────────
  useEffect(() => {
    getDoc(token)
      .then(d => { setDoc(d); setTitle(d.title || 'Untitled'); setLoading(false) })
      .catch(() => { setError('Document not found'); setLoading(false) })
  }, [token])

  // ── Apply template on first load ──────────────────────────────────────────
  useEffect(() => {
    const tpl = location.state?.template
    if (!tpl?.content || !doc) return
    const check = setInterval(() => {
      const quill = getQuill()
      if (!quill) return
      clearInterval(check)
      if (quill.getText().trim() === '') quill.setText(tpl.content)
    }, 200)
    return () => clearInterval(check)
  }, [doc, location.state, getQuill])

  // ── Sync title from Yjs ───────────────────────────────────────────────────
  useEffect(() => {
    if (!doc) return
    const check = setInterval(() => {
      const ydoc = getYdoc()
      if (!ydoc) return
      const ytitle = ydoc.getText('title')
      if (ytitle.toString()) setTitle(ytitle.toString())
    }, 1000)
    return () => clearInterval(check)
  }, [doc, getYdoc])

  // ── Title edit ────────────────────────────────────────────────────────────
  const titleTimerRef = useRef(null)
  const handleTitleChange = useCallback((e) => {
    const val = e.target.value
    setTitle(val)
    const ydoc = getYdoc()
    if (ydoc) {
      const ytitle = ydoc.getText('title')
      if (ytitle.toString() !== val) { ytitle.delete(0, ytitle.length); ytitle.insert(0, val) }
    }
    clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(() => {
      fetch(`/api/docs/${doc?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: val }),
      }).catch(() => {})
    }, 1000)
  }, [doc, getYdoc])

  // ── Ghost text helpers ────────────────────────────────────────────────────
  const clearGhost = useCallback(() => {
    setGhostText('')
    ghostCursorIndexRef.current = null
  }, [])

  const updateGhostPosition = useCallback(() => {
    const quill = getQuill()
    if (!quill) return
    const sel = quill.getSelection()
    if (!sel) return
    const bounds = quill.getBounds(sel.index)
    const editorEl = quill.root
    const rect = editorEl.getBoundingClientRect()
    setGhostPos({ top: rect.top + bounds.top, left: rect.left + bounds.left })
  }, [getQuill])

  // ── Always-on AI autocomplete (VS Code Copilot style) ────────────────────
  const triggerAutocomplete = useCallback(async () => {
    const quill = getQuill()
    if (!quill || isAutocompleting.current) return
    const sel = quill.getSelection()
    if (!sel) return
    const context = quill.getText(0, sel.index).trim()
    if (context.length < 20) return // need enough context

    // Abort any previous in-flight request
    if (abortControllerRef.current) abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()

    isAutocompleting.current = true
    ghostCursorIndexRef.current = sel.index
    updateGhostPosition()

    let accumulated = ''
    try {
      await streamAI(context, 'continue', (chunk) => {
        accumulated += chunk
        setGhostText(accumulated)
        updateGhostPosition()
      })
    } catch (_) {
      clearGhost()
    } finally {
      isAutocompleting.current = false
      if (!accumulated) clearGhost()
    }
  }, [getQuill, updateGhostPosition, clearGhost])

  // ── Accept ghost text on Tab ──────────────────────────────────────────────
  const acceptGhost = useCallback(() => {
    const quill = getQuill()
    if (!quill || !ghostText) return
    const idx = ghostCursorIndexRef.current
    if (idx == null) return
    quill.insertText(idx, ghostText, 'user')
    quill.setSelection(idx + ghostText.length)
    clearGhost()
  }, [getQuill, ghostText, clearGhost])

  // ── Slash command detection + ghost text dismissal ────────────────────────
  useEffect(() => {
    if (!doc) return
    const check = setInterval(() => {
      const quill = getQuill()
      if (!quill || quill._slashBound) return
      quill._slashBound = true

      quill.on('text-change', () => {
        // Any typing dismisses ghost text
        if (ghostCursorIndexRef.current !== null) clearGhost()

        const sel = quill.getSelection()
        if (!sel) return

        // Slash menu detection
        const text = quill.getText(0, sel.index)
        const lastSlash = text.lastIndexOf('/')
        if (lastSlash !== -1 && sel.index - lastSlash <= 20) {
          const query = text.slice(lastSlash + 1)
          if (!query.includes('\n') && !query.includes(' ')) {
            const bounds = quill.getBounds(sel.index)
            const rect = quill.root.getBoundingClientRect()
            setSlashMenu({
              visible: true,
              x: Math.min(rect.left + bounds.left, window.innerWidth - 300),
              y: Math.min(rect.top + bounds.top + bounds.height + 4, window.innerHeight - 400),
              query,
            })
            // Don't trigger autocomplete while slash menu is open
            clearTimeout(autocompleteTimerRef.current)
            return
          }
        }
        setSlashMenu(m => m.visible ? { ...m, visible: false } : m)

        // Debounce autocomplete trigger — 1.5s pause like Copilot
        clearTimeout(autocompleteTimerRef.current)
        autocompleteTimerRef.current = setTimeout(() => {
          if (!isAutocompleting.current) triggerAutocomplete()
        }, 1500)
      })

      quill.on('selection-change', () => {
        // Reposition ghost text if cursor moves
        if (ghostText) updateGhostPosition()
      })
    }, 300)
    return () => clearInterval(check)
  }, [doc, getQuill, clearGhost, triggerAutocomplete, updateGhostPosition]) // eslint-disable-line

  // ── AI actions (via stable ref to avoid stale closures) ───────────────────
  const aiActionsRef = useRef(null)
  aiActionsRef.current = {
    summarize: async () => {
      const quill = getQuill()
      if (!quill) return
      clearGhost()
      const text = quill.getText().trim()
      if (!text) return
      setIsAiLoading(true)
      const insertPos = quill.getLength()
      quill.insertText(insertPos - 1, '\n\n── AI Summary ──\n', { bold: true, color: '#3b82f6' }, 'user')
      let pos = quill.getLength() - 1
      try {
        await streamAI(text, 'summarize', (chunk) => {
          quill.insertText(pos, chunk, { bold: false, color: false }, 'user')
          pos += chunk.length
        })
      } catch (_) {}
      setIsAiLoading(false)
    },

    refine: async () => {
      const quill = getQuill()
      if (!quill) return
      clearGhost()
      const sel = quill.getSelection()
      const text = sel && sel.length > 0 ? quill.getText(sel.index, sel.length) : quill.getText()
      if (!text.trim()) return
      setIsAiLoading(true)
      const startIdx = sel && sel.length > 0 ? sel.index : 0
      const deleteLen = sel && sel.length > 0 ? sel.length : quill.getLength() - 1
      let refined = ''
      try {
        await streamAI(text, 'improve', (chunk) => { refined += chunk })
        // Replace after full response so we get clean text
        quill.deleteText(startIdx, deleteLen, 'user')
        quill.insertText(startIdx, refined, 'user')
        quill.setSelection(startIdx + refined.length)
      } catch (_) {}
      setIsAiLoading(false)
    },

    continueWriting: async () => {
      const quill = getQuill()
      if (!quill) return
      clearGhost()
      const sel = quill.getSelection()
      if (!sel) return
      const context = quill.getText(0, sel.index).trim()
      if (!context) return
      setIsAiLoading(true)
      ghostCursorIndexRef.current = sel.index
      updateGhostPosition()
      let accumulated = ''
      try {
        await streamAI(context, 'continue', (chunk) => {
          accumulated += chunk
          setGhostText(accumulated)
          updateGhostPosition()
        })
      } catch (_) { clearGhost() }
      setIsAiLoading(false)
      if (!accumulated) clearGhost()
    },

    bullets: async () => {
      const quill = getQuill()
      if (!quill) return
      clearGhost()
      const sel = quill.getSelection()
      const text = sel && sel.length > 0 ? quill.getText(sel.index, sel.length) : quill.getText()
      if (!text.trim()) return
      setIsAiLoading(true)
      const startIdx = sel && sel.length > 0 ? sel.index : 0
      const deleteLen = sel && sel.length > 0 ? sel.length : quill.getLength() - 1
      let result = ''
      try {
        await streamAI(text, 'bullets', (chunk) => { result += chunk })
        quill.deleteText(startIdx, deleteLen, 'user')
        quill.insertText(startIdx, result, 'user')
        quill.setSelection(startIdx + result.length)
      } catch (_) {}
      setIsAiLoading(false)
    },

    table: async () => {
      const quill = getQuill()
      if (!quill) return
      clearGhost()
      const sel = quill.getSelection()
      const text = sel && sel.length > 0 ? quill.getText(sel.index, sel.length) : quill.getText()
      if (!text.trim()) return
      setIsAiLoading(true)
      const startIdx = sel && sel.length > 0 ? sel.index : 0
      const deleteLen = sel && sel.length > 0 ? sel.length : 0
      let result = ''
      try {
        await streamAI(text, 'table', (chunk) => { result += chunk })
        if (deleteLen > 0) quill.deleteText(startIdx, deleteLen, 'user')
        quill.insertText(startIdx, '\n' + result + '\n', 'user')
        quill.setSelection(startIdx + result.length + 2)
      } catch (_) {}
      setIsAiLoading(false)
    },
  }

  // ── Slash command handler ─────────────────────────────────────────────────
  const handleSlashSelect = useCallback((cmd) => {
    const quill = getQuill()
    if (!quill) return
    const sel = quill.getSelection()
    if (!sel) return
    const text = quill.getText(0, sel.index)
    const lastSlash = text.lastIndexOf('/')
    const deleteCount = sel.index - lastSlash
    quill.deleteText(lastSlash, deleteCount, 'user')

    setSlashMenu(m => ({ ...m, visible: false }))
    clearGhost()

    // Use the ref so we always have freshest action closures
    setTimeout(() => {
      if (cmd.isAI) {
        cmd.action(quill, lastSlash, aiActionsRef.current)
      } else {
        cmd.action(quill, lastSlash)
      }
      quill.focus()
    }, 0)
  }, [getQuill, clearGhost])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Tab: accept ghost text
      if (e.key === 'Tab' && ghostCursorIndexRef.current !== null) {
        e.preventDefault()
        acceptGhost()
        return
      }
      // Escape: dismiss ghost text
      if (e.key === 'Escape') {
        if (ghostCursorIndexRef.current !== null) {
          clearGhost()
          isAutocompleting.current = false
          abortControllerRef.current?.abort()
        }
      }
      // Ctrl+Shift shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === 'C') { e.preventDefault(); setPanel(p => p === PANEL.CHAT ? PANEL.NONE : PANEL.CHAT) }
        if (e.key === 'H') { e.preventDefault(); setPanel(p => p === PANEL.HISTORY ? PANEL.NONE : PANEL.HISTORY) }
        if (e.key === 'F') { e.preventDefault(); setFocusMode(f => !f) }
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [acceptGhost, clearGhost])

  const togglePanel = (p) => setPanel(prev => prev === p ? PANEL.NONE : p)

  if (loading) {
    return (
      <div className="min-h-screen bg-notion-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-notion-border border-t-notion-silver rounded-full animate-spin" />
          <p className="text-sm text-notion-muted">Loading document…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-notion-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-notion-text mb-2">{error}</p>
          <button onClick={() => navigate('/')} className="text-sm text-notion-muted hover:text-notion-text transition-colors">
            ← Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-notion-bg overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.05] bg-bg-secondary/80 backdrop-blur-xl z-20">
        {/* Left */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-text-secondary hover:text-white transition-all duration-200"
            title="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-[1px] h-4 bg-white/10" />
          <input
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled Document"
            className="text-sm font-semibold bg-transparent border-none outline-none text-text-primary placeholder-white/20 w-48 sm:w-80 font-display"
          />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <ExportMenu getQuill={getQuill} title={title} />

          <div className="w-[1px] h-4 bg-white/10 mx-2" />

          <button
            onClick={() => window.open(`/view/${doc?.view_token}`, '_blank')}
            className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-white/[0.05] transition-all"
            title="Preview mode"
          >
            <Eye size={16} />
          </button>

          <button
            onClick={() => togglePanel(PANEL.CHAT)}
            className={`p-2 rounded-lg transition-all relative ${panel === PANEL.CHAT ? 'bg-accent-soft text-accent-color' : 'text-text-secondary hover:text-white hover:bg-white/[0.05]'}`}
            title="Discussion (Ctrl+Shift+C)"
          >
            <MessageSquare size={16} />
            {chatMessages.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            )}
          </button>

          <button
            onClick={() => togglePanel(PANEL.HISTORY)}
            className={`p-2 rounded-lg transition-all ${panel === PANEL.HISTORY ? 'bg-accent-soft text-accent-color' : 'text-text-secondary hover:text-white hover:bg-white/[0.05]'}`}
            title="History (Ctrl+Shift+H)"
          >
            <Clock size={16} />
          </button>

          {isAiLoading && (
            <div className="ml-2 flex items-center gap-2 px-3 py-1 bg-accent-soft rounded-full border border-accent-color/20">
              <Sparkles size={12} className="text-accent-color animate-pulse" />
              <span className="text-[10px] font-bold text-accent-color uppercase tracking-wider">AI Thinking</span>
            </div>
          )}

          {ghostText && !isAiLoading && (
            <div className="ml-2 flex items-center gap-2 px-3 py-1 bg-purple-500/10 rounded-full border border-purple-500/20">
              <Sparkles size={12} className="text-purple-400" />
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Tab to Accept</span>
            </div>
          )}
        </div>
      </div>

      {/* Presence bar */}
      <PresenceBar
        doc={doc}
        users={users}
        connected={connected}
        onUpdateUser={(name, color) => {
          setLocalUser(name, color)
          updateLocalUser(name, color)
        }}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden bg-bg-primary relative">
        {/* Sidebar panels */}
        {panel !== PANEL.NONE && (
          <div className="w-80 flex-shrink-0 overflow-y-auto border-r border-white/[0.05] bg-bg-secondary/50">
            {panel === PANEL.CHAT && (
              <ChatPanel onClose={() => setPanel(PANEL.NONE)} sendChat={sendChat} messages={chatMessages} users={users} />
            )}
            {panel === PANEL.HISTORY && (
              <RevisionPanel docId={doc?.id} onClose={() => setPanel(PANEL.NONE)} onRestored={() => {}} />
            )}
          </div>
        )}

        {/* Editor area */}
        <div className={`flex-1 overflow-y-auto relative transition-all flex flex-col items-center`}>
          <Toolbar getQuill={getQuill} focusMode={focusMode} onToggleFocus={() => setFocusMode(f => !f)} />

          {/* Word-like page */}
          <div className="py-12 px-4 w-full flex justify-center">
            <div
              className={`relative bg-bg-secondary border border-white/5 rounded-sm shadow-2xl shadow-black/50 transition-all duration-300 w-full max-w-[850px] min-h-[1100px] ${focusMode ? 'ring-1 ring-accent-color/30' : ''}`}
            >
              <div className="relative h-full w-full">
                <div ref={editorContainerRef} className="h-full w-full word-page-editor" />

                {/* Remote cursors */}
                {doc && (
                  <RemoteCursors
                    users={users.filter(u => u.cursor)}
                    getQuill={getQuill}
                    focusMode={focusMode}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ghost text overlay — fixed-positioned at cursor */}
      {ghostText && (
        <div
          className="ghost-suggestion"
          style={{
            position: 'fixed',
            top: ghostPos.top,
            left: ghostPos.left,
            pointerEvents: 'none',
            zIndex: 50,
            lineHeight: '1.7',
            fontSize: '16px',
            fontFamily: 'var(--font-main)',
          }}
        >
          <span className="ghost-suggestion-text">{ghostText}</span>
        </div>
      )}

      {/* Slash command menu */}
      {slashMenu.visible && (
        <SlashMenu
          position={{ x: slashMenu.x, y: slashMenu.y }}
          query={slashMenu.query}
          onSelect={handleSlashSelect}
          onClose={() => setSlashMenu(m => ({ ...m, visible: false }))}
        />
      )}
    </div>
  )
}
