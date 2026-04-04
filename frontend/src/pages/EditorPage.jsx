import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, MessageSquare, Sparkles, Clock, Eye,
  ChevronRight
} from 'lucide-react'
import { getDoc } from '../lib/api'
import { setLocalUser } from '../lib/colors'
import { useCollabEditor } from '../hooks/useCollabEditor'
import PresenceBar from '../components/PresenceBar'
import Toolbar from '../components/Toolbar'
import ChatPanel from '../components/ChatPanel'
import AIPanel from '../components/AIPanel'
import RevisionPanel from '../components/RevisionPanel'
import RemoteCursors from '../components/RemoteCursors'
import SlashMenu from '../components/SlashMenu'
import ExportMenu from '../components/ExportMenu'

const PANEL = { CHAT: 'chat', AI: 'ai', HISTORY: 'history', NONE: null }

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

  // Slash menu state
  const [slashMenu, setSlashMenu] = useState({ visible: false, x: 0, y: 0, query: '' })
  const slashInsertIdx = useRef(null)

  const editorContainerRef = useRef(null)

  // ── Chat handlers ──────────────────────────────────────────────────────────
  const onChatMessage = useCallback((msg) => {
    setChatMessages(prev => [...prev, msg])
  }, [])

  const onChatHistory = useCallback((history) => {
    setChatMessages(history)
  }, [])

  // ── Collab hook ────────────────────────────────────────────────────────────
  const { connected, users, sendChat, updateLocalUser, getYdoc, getQuill } = useCollabEditor({
    docId: doc?.id,
    containerRef: editorContainerRef,
    readonly: false,
    onChatMessage,
    onChatHistory,
  })

  // ── Load doc ───────────────────────────────────────────────────────────────
  useEffect(() => {
    getDoc(token)
      .then(d => {
        setDoc(d)
        setTitle(d.title || 'Untitled')
        setLoading(false)
      })
      .catch(() => {
        setError('Document not found')
        setLoading(false)
      })
  }, [token])

  // ── Apply template on first load ───────────────────────────────────────────
  useEffect(() => {
    const tpl = location.state?.template
    if (!tpl?.content || !doc) return
    const check = setInterval(() => {
      const quill = getQuill()
      if (!quill) return
      clearInterval(check)
      if (quill.getText().trim() === '') {
        quill.setText(tpl.content)
      }
    }, 200)
    return () => clearInterval(check)
  }, [doc, location.state, getQuill])

  // ── Sync title from Yjs ────────────────────────────────────────────────────
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

  // ── Title edit ──────────────────────────────────────────────────────────────
  const handleTitleChange = useCallback((e) => {
    const val = e.target.value
    setTitle(val)
    const ydoc = getYdoc()
    if (!ydoc) return
    const ytitle = ydoc.getText('title')
    if (ytitle.toString() !== val) {
      ytitle.delete(0, ytitle.length)
      ytitle.insert(0, val)
    }
    // Debounce REST update
    clearTimeout(handleTitleChange._timer)
    handleTitleChange._timer = setTimeout(() => {
      fetch(`/api/docs/${doc?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: val }),
      }).catch(() => {})
    }, 1000)
  }, [doc, getYdoc])

  // ── Slash command detection ────────────────────────────────────────────────
  useEffect(() => {
    if (!doc) return
    const check = setInterval(() => {
      const quill = getQuill()
      if (!quill || quill._slashBound) return
      quill._slashBound = true

      quill.on('text-change', (delta) => {
        const sel = quill.getSelection()
        if (!sel) return
        const text = quill.getText(0, sel.index)
        const lastSlash = text.lastIndexOf('/')
        if (lastSlash === -1 || sel.index - lastSlash > 20) {
          setSlashMenu(m => m.visible ? { ...m, visible: false } : m)
          return
        }
        const query = text.slice(lastSlash + 1)
        if (query.includes('\n') || query.includes(' ')) {
          setSlashMenu(m => m.visible ? { ...m, visible: false } : m)
          return
        }
        slashInsertIdx.current = lastSlash + 1
        const bounds = quill.getBounds(sel.index)
        const editorEl = quill.root
        const rect = editorEl.getBoundingClientRect()
        setSlashMenu({
          visible: true,
          x: Math.min(rect.left + bounds.left, window.innerWidth - 260),
          y: Math.min(rect.top + bounds.top + bounds.height + 4, window.innerHeight - 300),
          query,
        })
      })
    }, 300)
    return () => clearInterval(check)
  }, [doc, getQuill])

  const handleSlashSelect = useCallback((cmd) => {
    const quill = getQuill()
    if (!quill) return
    const sel = quill.getSelection()
    if (!sel) return
    const text = quill.getText(0, sel.index)
    const lastSlash = text.lastIndexOf('/')
    const deleteCount = sel.index - lastSlash
    quill.deleteText(lastSlash, deleteCount, 'user')
    cmd.action(quill, lastSlash)
    setSlashMenu(m => ({ ...m, visible: false }))
    quill.focus()
  }, [getQuill])

  // ── Panel toggle ────────────────────────────────────────────────────────────
  const togglePanel = (p) => setPanel(prev => prev === p ? PANEL.NONE : p)

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === 'C') { e.preventDefault(); togglePanel(PANEL.CHAT) }
        if (e.key === 'A') { e.preventDefault(); togglePanel(PANEL.AI) }
        if (e.key === 'H') { e.preventDefault(); togglePanel(PANEL.HISTORY) }
        if (e.key === 'F') { e.preventDefault(); setFocusMode(f => !f) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
      <div className="flex items-center justify-between px-4 py-2 border-b border-notion-border bg-notion-surface/90 backdrop-blur-sm z-10">
        {/* Left */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded hover:bg-notion-hover text-notion-muted hover:text-notion-text transition-all"
            title="Back to dashboard"
          >
            <ArrowLeft size={15} />
          </button>
          <ChevronRight size={12} className="text-notion-border" />
          <input
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            className="text-sm font-medium bg-transparent border-none outline-none text-notion-text placeholder-notion-border w-48 sm:w-64"
          />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <ExportMenu getQuill={getQuill} title={title} />

          <div className="w-px h-4 bg-notion-border mx-1" />

          <button
            onClick={() => window.open(`/view/${doc?.view_token}`, '_blank')}
            className="flex items-center gap-1.5 text-xs text-notion-muted hover:text-notion-silver px-2 py-1.5 rounded hover:bg-notion-hover transition-all"
            title="Open read-only view"
          >
            <Eye size={12} />
          </button>

          <button
            onClick={() => togglePanel(PANEL.CHAT)}
            title="Chat (Ctrl+Shift+C)"
            className={`relative flex items-center gap-1.5 text-xs px-2 py-1.5 rounded transition-all ${panel === PANEL.CHAT ? 'bg-notion-hover text-notion-text border border-notion-border' : 'text-notion-muted hover:text-notion-silver hover:bg-notion-hover'}`}
          >
            <MessageSquare size={13} />
            {chatMessages.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
            )}
          </button>

          <button
            onClick={() => togglePanel(PANEL.AI)}
            title="AI Assistant (Ctrl+Shift+A)"
            className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded transition-all ${panel === PANEL.AI ? 'bg-notion-hover text-notion-text border border-notion-border' : 'text-notion-muted hover:text-notion-silver hover:bg-notion-hover'}`}
          >
            <Sparkles size={13} />
          </button>

          <button
            onClick={() => togglePanel(PANEL.HISTORY)}
            title="Revision History (Ctrl+Shift+H)"
            className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded transition-all ${panel === PANEL.HISTORY ? 'bg-notion-hover text-notion-text border border-notion-border' : 'text-notion-muted hover:text-notion-silver hover:bg-notion-hover'}`}
          >
            <Clock size={13} />
          </button>
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

      {/* Toolbar */}
      <Toolbar getQuill={getQuill} focusMode={focusMode} onToggleFocus={() => setFocusMode(f => !f)} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor area */}
        <div className={`flex-1 overflow-y-auto relative transition-all ${focusMode ? 'bg-notion-bg' : 'bg-notion-bg'}`}>
          <div
            className="max-w-3xl mx-auto relative"
            style={{ minHeight: 'calc(100vh - 200px)' }}
          >
            {/* Quill editor mount point */}
            <div
              ref={editorContainerRef}
              className={`transition-all duration-300 ${focusMode ? 'opacity-100' : 'opacity-100'}`}
            />

            {/* Remote cursors overlay */}
            {doc && (
              <RemoteCursors
                users={users.filter(u => u.cursor)}
                getQuill={getQuill}
                focusMode={focusMode}
              />
            )}
          </div>
        </div>

        {/* Side panel */}
        {panel !== PANEL.NONE && (
          <div className="w-80 flex-shrink-0 overflow-hidden animate-slide-up border-l border-notion-border">
            {panel === PANEL.CHAT && (
              <ChatPanel
                onClose={() => setPanel(PANEL.NONE)}
                sendChat={sendChat}
                messages={chatMessages}
                users={users}
              />
            )}
            {panel === PANEL.AI && (
              <AIPanel
                onClose={() => setPanel(PANEL.NONE)}
                getQuill={getQuill}
              />
            )}
            {panel === PANEL.HISTORY && (
              <RevisionPanel
                docId={doc?.id}
                onClose={() => setPanel(PANEL.NONE)}
                onRestored={() => {}}
              />
            )}
          </div>
        )}
      </div>

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
