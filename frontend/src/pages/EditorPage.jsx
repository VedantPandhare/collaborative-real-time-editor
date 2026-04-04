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
  const [prediction, setPrediction] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)

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

  // ── AI Actions ─────────────────────────────────────────────────────────────
  const aiActions = {
    summarize: async () => {
      const quill = getQuill()
      if (!quill) return
      const text = quill.getText()
      setIsAiLoading(true)
      try {
        const res = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, action: 'summarize' })
        })
        const reader = res.body.getReader()
        quill.insertText(quill.getLength(), '\n\nSUMMARY:\n', { bold: true })
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = new TextDecoder().decode(value)
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') break
              try {
                const { text: t } = JSON.parse(data)
                if (t) quill.insertText(quill.getLength(), t)
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
      setIsAiLoading(false)
    },
    refine: async () => {
      const quill = getQuill()
      if (!quill) return
      const sel = quill.getSelection()
      const text = sel ? quill.getText(sel.index, sel.length) : quill.getText()
      if (!text) return
      setIsAiLoading(true)
      try {
        const res = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, action: 'improve' })
        })
        const reader = res.body.getReader()
        if (sel) quill.deleteText(sel.index, sel.length)
        else quill.deleteText(0, quill.getLength())
        
        let currentPos = sel ? sel.index : 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = new TextDecoder().decode(value)
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') break
              try {
                const { text: t } = JSON.parse(data)
                if (t) {
                  quill.insertText(currentPos, t)
                  currentPos += t.length
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
      setIsAiLoading(false)
    },
    continueWriting: async () => {
      const quill = getQuill()
      if (!quill) return
      const sel = quill.getSelection()
      if (!sel) return
      const context = quill.getText(0, sel.index)
      setIsAiLoading(true)
      setPrediction('')
      try {
        const res = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: context, action: 'continue' })
        })
        const reader = res.body.getReader()
        let fullPred = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = new TextDecoder().decode(value)
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') break
              try {
                const { text: t } = JSON.parse(data)
                if (t) {
                  fullPred += t
                  setPrediction(fullPred)
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
      setIsAiLoading(false)
    }
  }

  const handleSlashSelect = useCallback((cmd) => {
    const quill = getQuill()
    if (!quill) return
    const sel = quill.getSelection()
    if (!sel) return
    const text = quill.getText(0, sel.index)
    const lastSlash = text.lastIndexOf('/')
    const deleteCount = sel.index - lastSlash
    quill.deleteText(lastSlash, deleteCount, 'user')
    
    if (cmd.isAI) {
      cmd.action(quill, lastSlash, aiActions)
    } else {
      cmd.action(quill, lastSlash)
    }
    
    setSlashMenu(m => ({ ...m, visible: false }))
    quill.focus()
  }, [getQuill, aiActions])

  // ── Panel toggle ────────────────────────────────────────────────────────────
  const togglePanel = (p) => setPanel(prev => prev === p ? PANEL.NONE : p)

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === 'C') { e.preventDefault(); togglePanel(PANEL.CHAT) }
        if (e.key === 'H') { e.preventDefault(); togglePanel(PANEL.HISTORY) }
        if (e.key === 'F') { e.preventDefault(); setFocusMode(f => !f) }
      }
      if (e.key === 'Tab' && prediction) {
        e.preventDefault()
        const quill = getQuill()
        if (quill) {
          const sel = quill.getSelection()
          if (sel) {
            quill.insertText(sel.index, prediction)
            quill.setSelection(sel.index + prediction.length)
          }
        }
        setPrediction('')
      }
      if (e.key === 'Escape' && prediction) {
        setPrediction('')
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
            title="Discussion"
          >
            <MessageSquare size={16} />
            {chatMessages.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            )}
          </button>

          <button
            onClick={() => togglePanel(PANEL.HISTORY)}
            className={`p-2 rounded-lg transition-all ${panel === PANEL.HISTORY ? 'bg-accent-soft text-accent-color' : 'text-text-secondary hover:text-white hover:bg-white/[0.05]'}`}
            title="History"
          >
            <Clock size={16} />
          </button>

          {isAiLoading && (
            <div className="ml-2 flex items-center gap-2 px-3 py-1 bg-accent-soft rounded-full border border-accent-color/20">
              <Sparkles size={12} className="text-accent-color animate-pulse" />
              <span className="text-[10px] font-bold text-accent-color uppercase tracking-wider">AI Thinking</span>
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
        {/* Sidebar/Remote Panels */}
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
        <div className={`flex-1 overflow-y-auto relative transition-all flex flex-col items-center ${focusMode ? '' : ''}`}>
          {/* Toolbar at the top of the editor feed */}
          <Toolbar getQuill={getQuill} focusMode={focusMode} onToggleFocus={() => setFocusMode(f => !f)} />

          {/* Word-like Page Wrapper */}
          <div className="py-12 px-4 w-full flex justify-center">
            <div
              className={`relative bg-bg-secondary border border-white/5 rounded-sm shadow-2xl shadow-black/50 transition-all duration-300 w-full max-w-[850px] min-h-[1100px] ${focusMode ? 'opacity-100 ring-1 ring-accent-color/30' : 'opacity-100'}`}
            >
              <div className="relative h-full w-full">
                {/* Quill editor mount point */}
                <div ref={editorContainerRef} className="h-full w-full word-page-editor" />
                
                {prediction && (
                  <div 
                    className="ghost-text absolute pointer-events-none select-none z-10"
                    style={{
                      top: getQuill()?.getBounds(getQuill()?.getSelection()?.index || 0)?.top,
                      left: getQuill()?.getBounds(getQuill()?.getSelection()?.index || 0)?.left,
                    }}
                  >
                    {prediction}
                    <span className="ml-2 text-[9px] bg-white/10 px-1.5 py-0.5 rounded uppercase tracking-tighter not-italic">Tab to accept</span>
                  </div>
                )}
              </div>

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
        </div>
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
