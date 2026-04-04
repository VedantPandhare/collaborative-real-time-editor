import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { EditorContent } from '@tiptap/react'
import { ArrowLeft, MessageSquare, Sparkles, Clock, Check, FileText } from 'lucide-react'
import { getDoc, streamAI, updateDocTitle } from '../lib/api'
import { setLocalUser } from '../lib/colors'
import { useCollabEditor } from '../hooks/useCollabEditorEnhanced'
import PresenceBar from '../components/PresenceBar'
import Toolbar from '../components/ToolbarRich'
import ChatPanel from '../components/ChatPanel'
import RevisionPanel from '../components/RevisionPanel'
import RemoteCursors from '../components/RemoteCursorsTiptap'
import SlashMenu from '../components/SlashMenu'
import ExportMenu from '../components/ExportMenuModern'
import DocumentMap from '../components/DocumentMap'

const PAGE_HEIGHT = 1100

function buildOutline(editor) {
  if (!editor) return []
  const next = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    next.push({
      index: pos,
      level: Number(node.attrs.level || 1),
      page: Math.max(1, Math.floor(next.length / 6) + 1),
      text: node.textContent.trim(),
    })
  })
  return next.filter((item) => item.text)
}

function getActiveOutlineIndex(editor, outline) {
  if (!editor || outline.length === 0) return null
  const cursor = editor.state.selection.from ?? 0
  let active = outline[0]?.index ?? null
  for (const item of outline) {
    if (item.index <= cursor) active = item.index
  }
  return active
}

export default function EditorPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [title, setTitle] = useState('untitled')
  const [chatMessages, setChatMessages] = useState([])
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [ghostText, setGhostText] = useState('')
  const [ghostPos, setGhostPos] = useState({ top: 0, left: 0 })
  const [slashMenu, setSlashMenu] = useState({ visible: false, x: 0, y: 0, query: '' })
  const [outline, setOutline] = useState([])
  const [activeOutlineIndex, setActiveOutlineIndex] = useState(null)
  const [showOutline, setShowOutline] = useState(true)

  const ghostCursorIndexRef = useRef(null)
  const autocompleteTimerRef = useRef(null)
  const isAutocompleting = useRef(false)
  const abortControllerRef = useRef(null)
  const titleTimerRef = useRef(null)
  const onChatMessage = useCallback((msg) => setChatMessages((prev) => [...prev, msg]), [])
  const onChatHistory = useCallback((history) => setChatMessages(history), [])

  const { connected, users, sendChat, updateLocalUser, getYdoc, getEditor, editor } = useCollabEditor({
    docId: doc?.id,
    readonly: false,
    onChatMessage,
    onChatHistory,
  })

  const clearGhost = useCallback(() => {
    setGhostText('')
    ghostCursorIndexRef.current = null
  }, [])

  const updateGhostPosition = useCallback(() => {
    const nextEditor = getEditor()
    if (!nextEditor) return
    const pos = nextEditor.state.selection.from
    const coords = nextEditor.view.coordsAtPos(pos)
    setGhostPos({ top: coords.top, left: coords.left })
  }, [getEditor])

  const refreshOutline = useCallback(() => {
    const nextEditor = getEditor()
    if (!nextEditor) return
    const nextOutline = buildOutline(nextEditor)
    setOutline(nextOutline)
    setActiveOutlineIndex(getActiveOutlineIndex(nextEditor, nextOutline))
  }, [getEditor])

  const insertAiBlock = useCallback((label, text, index = null) => {
    const nextEditor = getEditor()
    if (!nextEditor || !text.trim()) return
    nextEditor.chain().focus(index ?? nextEditor.state.selection.to).insertContent(`
      <blockquote>
        <p><strong><em>${label}</em></strong></p>
        <p><em>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</em></p>
      </blockquote>
      <p></p>
    `).run()
  }, [getEditor])

  const triggerAutocomplete = useCallback(async () => {
    const nextEditor = getEditor()
    if (!nextEditor || isAutocompleting.current) return
    const selection = nextEditor.state.selection
    const context = nextEditor.state.doc.textBetween(0, selection.from, '\n', '\n').trim()
    if (context.length < 24) return

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    isAutocompleting.current = true
    ghostCursorIndexRef.current = selection.from
    updateGhostPosition()

    let preview = ''
    try {
      await streamAI(context, 'continue', (chunk) => {
        preview += chunk
        setGhostText(preview)
        updateGhostPosition()
      }, controller.signal)
    } catch (_) {
      if (!controller.signal.aborted) clearGhost()
    } finally {
      isAutocompleting.current = false
      if (!preview) clearGhost()
    }
  }, [clearGhost, getEditor, updateGhostPosition])

  const acceptGhost = useCallback(() => {
    const nextEditor = getEditor()
    const index = ghostCursorIndexRef.current
    if (!nextEditor || !ghostText || index == null) return
    nextEditor.chain().focus(index).insertContent(ghostText).run()
    clearGhost()
  }, [clearGhost, getEditor, ghostText])

  useEffect(() => {
    getDoc(token)
      .then((data) => {
        setDoc(data)
        setTitle(data.title || 'untitled')
        setLoading(false)
      })
      .catch(() => {
        setError('Document not found')
        setLoading(false)
      })
  }, [token])

  useEffect(() => {
    const template = location.state?.template
    if (!template?.content || !doc) return

    const timer = setInterval(() => {
      const nextEditor = getEditor()
      if (!nextEditor) return
      clearInterval(timer)
      if (nextEditor.getText().trim() === '') {
        nextEditor.commands.setContent(template.content.split('\n').map((line) => line ? `<p>${line}</p>` : '<p></p>').join(''))
      }
    }, 150)

    return () => clearInterval(timer)
  }, [doc, getEditor, location.state])

  useEffect(() => {
    if (!doc) return
    const timer = setInterval(() => {
      const ydoc = getYdoc()
      if (!ydoc) return
      const ytitle = ydoc.getText('title').toString()
      if (ytitle && ytitle !== title) {
        setTitle(ytitle)
      }
    }, 750)
    return () => clearInterval(timer)
  }, [doc, getYdoc, title])

  useEffect(() => {
    if (!doc) return
    const timer = setInterval(() => {
      const nextEditor = getEditor()
      if (!nextEditor || nextEditor.__coolabEnhanced) return
      nextEditor.__coolabEnhanced = true

      const handleTextChange = () => {
        clearGhost()
        refreshOutline()

        const selection = nextEditor.state.selection
        const text = nextEditor.state.doc.textBetween(0, selection.from, '\n', '\n')
        const lastSlash = text.lastIndexOf('/')
        if (lastSlash !== -1 && selection.from - lastSlash <= 24) {
          const query = text.slice(lastSlash + 1)
          if (!query.includes('\n') && !query.includes(' ')) {
            const coords = nextEditor.view.coordsAtPos(selection.from)
            setSlashMenu({
              visible: true,
              x: Math.min(coords.left, window.innerWidth - 320),
              y: Math.min(coords.bottom + 4, window.innerHeight - 400),
              query,
            })
            clearTimeout(autocompleteTimerRef.current)
            return
          }
        }

        setSlashMenu((current) => (current.visible ? { ...current, visible: false } : current))
        clearTimeout(autocompleteTimerRef.current)
        autocompleteTimerRef.current = setTimeout(() => {
          if (!isAutocompleting.current) {
            triggerAutocomplete()
          }
        }, 1100)
      }

      const handleSelectionChange = () => {
        if (ghostText) updateGhostPosition()
        refreshOutline()
      }

      nextEditor.on('update', handleTextChange)
      nextEditor.on('selectionUpdate', handleSelectionChange)
      refreshOutline()

      nextEditor.__coolabCleanup = () => {
        nextEditor.off('update', handleTextChange)
        nextEditor.off('selectionUpdate', handleSelectionChange)
        delete nextEditor.__coolabEnhanced
      }
    }, 150)

    return () => {
      clearInterval(timer)
      const nextEditor = getEditor()
      nextEditor?.__coolabCleanup?.()
    }
  }, [clearGhost, doc, getEditor, ghostText, refreshOutline, triggerAutocomplete, updateGhostPosition])

  const runAiTransform = useCallback(async (action, { mode = 'append', label = 'AI Suggestion:' } = {}) => {
    const nextEditor = getEditor()
    if (!nextEditor) return
    clearGhost()

    const selection = nextEditor.state.selection
    const text = selection.from !== selection.to
      ? nextEditor.state.doc.textBetween(selection.from, selection.to, '\n', '\n')
      : nextEditor.getText().trim()

    if (!text) return

    setIsAiLoading(true)
    let output = ''
    try {
      await streamAI(text, action, (chunk) => {
        output += chunk
      })

      if (mode === 'replace') {
        nextEditor.chain().focus().deleteSelection().insertContent(output).run()
      } else {
        const insertAt = selection.to
        insertAiBlock(label, output, insertAt)
      }
    } finally {
      setIsAiLoading(false)
    }
  }, [clearGhost, getEditor, insertAiBlock])

  const aiActionsRef = useRef(null)
  aiActionsRef.current = {
    summarize: () => runAiTransform('summarize', { mode: 'append', label: 'AI Summary:' }),
    refine: () => runAiTransform('improve', { mode: 'append', label: 'AI Refinement:' }),
    bullets: () => runAiTransform('bullets', { mode: 'replace' }),
    table: () => runAiTransform('table', { mode: 'append', label: 'AI Table:' }),
    continueWriting: async () => {
      const nextEditor = getEditor()
      if (!nextEditor) return
      clearGhost()
      const selection = nextEditor.state.selection
      ghostCursorIndexRef.current = selection.from
      updateGhostPosition()
      setIsAiLoading(true)
      try {
        await triggerAutocomplete()
      } finally {
        setIsAiLoading(false)
      }
    },
  }

  const handleTitleChange = useCallback((event) => {
    const nextTitle = event.target.value || 'untitled'
    setTitle(nextTitle)

    const ydoc = getYdoc()
    if (ydoc) {
      const ytitle = ydoc.getText('title')
      if (ytitle.toString() !== nextTitle) {
        ytitle.delete(0, ytitle.length)
        ytitle.insert(0, nextTitle)
      }
    }

    clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(() => {
      updateDocTitle(doc?.id, nextTitle).catch(() => {})
    }, 600)
  }, [doc?.id, getYdoc])

  const handleSlashSelect = useCallback((command) => {
    const nextEditor = getEditor()
    if (!nextEditor) return
    const selection = nextEditor.state.selection
    const text = nextEditor.state.doc.textBetween(0, selection.from, '\n', '\n')
    const lastSlash = text.lastIndexOf('/')
    if (lastSlash !== -1) {
      nextEditor.chain().focus().deleteRange({ from: selection.from - (selection.from - lastSlash), to: selection.from }).run()
    }

    setSlashMenu((current) => ({ ...current, visible: false }))
    clearGhost()

    setTimeout(() => {
      if (command.isAI) {
        command.action(nextEditor, lastSlash, aiActionsRef.current)
      } else {
        command.action(nextEditor, lastSlash)
      }
      nextEditor.commands.focus()
      refreshOutline()
    }, 0)
  }, [clearGhost, getEditor, refreshOutline])

  const jumpToOutline = useCallback((index) => {
    const nextEditor = getEditor()
    if (!nextEditor) return
    nextEditor.commands.focus(index)
    nextEditor.view.dispatch(nextEditor.view.state.tr.scrollIntoView())
    setActiveOutlineIndex(index)
  }, [getEditor])

  const wordCount = useCallback(() => {
    const nextEditor = getEditor()
    if (!nextEditor) return 0
    return nextEditor.getText().trim().split(/\s+/).filter(Boolean).length
  }, [getEditor])

  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Tab' && ghostCursorIndexRef.current !== null) {
        event.preventDefault()
        acceptGhost()
        return
      }

      if (event.key === 'Escape') {
        if (ghostCursorIndexRef.current !== null) {
          clearGhost()
          abortControllerRef.current?.abort()
          isAutocompleting.current = false
        }
        setSlashMenu((current) => ({ ...current, visible: false }))
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        if (event.key === 'C') {
          event.preventDefault()
          setShowChat((value) => !value)
        }
        if (event.key === 'H') {
          event.preventDefault()
          setShowHistory((value) => !value)
        }
      }
    }

    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [acceptGhost, clearGhost])

  if (loading) {
    return (
      <div className="min-h-screen bg-notion-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-notion-border border-t-notion-silver rounded-full animate-spin" />
          <p className="text-sm text-notion-muted">Loading document...</p>
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
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-notion-bg text-text-primary">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 left-[18%] h-64 w-64 rounded-full bg-accent-color/10 blur-3xl" />
        <div className="absolute right-[-6%] top-[24%] h-80 w-80 rounded-full bg-white/[0.03] blur-3xl" />
        <div className="absolute bottom-[-8%] left-[42%] h-72 w-72 rounded-full bg-accent-color/5 blur-3xl" />
      </div>

      <header className="relative z-40 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-3 sm:px-6 bg-bg-secondary/90 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="group flex shrink-0 items-center gap-3"
            title="Back to dashboard"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-accent-soft border border-accent-color/20 shadow-[0_14px_32px_rgba(59,130,246,0.18)] transition-transform group-hover:-translate-y-0.5">
              <FileText size={20} className="text-accent-color" />
            </div>
            <div className="hidden pr-2 sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-text-muted">coolab</p>
              <p className="text-sm font-semibold text-text-primary">Writing studio</p>
            </div>
          </button>
          <div className="hidden h-8 w-px bg-white/[0.08] sm:block" />
          <div className="min-w-0 pl-1">
            <input
              value={title}
              onChange={handleTitleChange}
              placeholder="untitled"
              className="max-w-[44vw] sm:max-w-[32vw] truncate rounded-xl px-3 py-2 bg-transparent text-left text-base font-semibold text-text-primary hover:bg-white/[0.04] focus:bg-white/[0.04] transition-colors outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-accent-color/20 px-3 py-2 text-xs font-semibold text-green-400 bg-green-500/10 md:flex">
            <Check size={14} />
            <span>Saved</span>
          </div>

          <ExportMenu editor={editor} title={title} />

          <button
            onClick={() => setShowChat((value) => !value)}
            className={`p-2 rounded-lg transition-all relative ${showChat ? 'bg-accent-soft text-accent-color' : 'text-text-secondary hover:text-white hover:bg-white/[0.05]'}`}
            title="Discussion (Ctrl+Shift+C)"
          >
            <MessageSquare size={16} />
            {chatMessages.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setShowHistory(true)}
            className={`p-2 rounded-lg transition-all ${showHistory ? 'bg-accent-soft text-accent-color' : 'text-text-secondary hover:text-white hover:bg-white/[0.05]'}`}
            title="Version history (Ctrl+Shift+H)"
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
            <div className="ml-2 flex items-center gap-2 px-3 py-1 bg-white/[0.04] rounded-full border border-white/[0.08]">
              <Sparkles size={12} className="text-accent-color" />
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Tab to Accept</span>
            </div>
          )}
        </div>
      </header>

      <PresenceBar
        doc={doc}
        users={users}
        connected={connected}
        onUpdateUser={(name, color) => {
          setLocalUser(name, color)
          updateLocalUser(name, color)
        }}
      />

      <div className="relative z-30 border-b border-white/[0.05] bg-bg-secondary/80 backdrop-blur-xl">
        <Toolbar
          editor={editor}
          showOutline={showOutline}
          onToggleOutline={() => setShowOutline((value) => !value)}
          wordCount={wordCount()}
        />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 gap-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        {showOutline && (
          <DocumentMap
            outline={outline}
            activeIndex={activeOutlineIndex}
            onJump={jumpToOutline}
            wordCount={wordCount()}
            collaborators={users.length}
          />
        )}

        <div className="flex-1 flex">
          <div className="min-w-0 flex-1 flex-col gap-3">
            <div className="flex-1 rounded-[36px] border border-white/[0.05] bg-bg-secondary/55 shadow-[0_30px_60px_rgba(0,0,0,0.22)]">
              <div className="mx-auto w-full max-w-[980px] px-3 py-4 sm:px-6 sm:py-5">
                <div className="rounded-[34px] border border-white/[0.05] bg-bg-secondary p-3 shadow-[0_20px_44px_rgba(0,0,0,0.20)] sm:p-4">
                  <div className="rounded-[30px] border border-white/[0.05] bg-[#fffdfa08] px-2 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4 sm:py-4">
                    <div className="mx-auto max-w-3xl">
                      <EditorContent editor={editor} className="h-full w-full" />
                      {doc && (
                        <RemoteCursors users={users.filter((user) => user.cursor)} getEditor={getEditor} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {showChat && (
            <div className="w-80 flex-shrink-0 overflow-y-auto border-l border-white/[0.05] bg-bg-secondary/50">
              <ChatPanel onClose={() => setShowChat(false)} sendChat={sendChat} messages={chatMessages} users={users} />
            </div>
          )}
        </div>
      </div>

      {ghostText && (
        <div
          className="ghost-suggestion"
          style={{
            position: 'fixed',
            top: ghostPos.top,
            left: ghostPos.left,
            pointerEvents: 'none',
            zIndex: 50,
            lineHeight: '1.55',
            fontSize: '15px',
            fontFamily: 'Georgia, Times New Roman, serif',
          }}
        >
          <span className="ghost-suggestion-text">{ghostText}</span>
        </div>
      )}

      {slashMenu.visible && (
        <SlashMenu
          position={{ x: slashMenu.x, y: slashMenu.y }}
          query={slashMenu.query}
          onSelect={handleSlashSelect}
          onClose={() => setSlashMenu((current) => ({ ...current, visible: false }))}
        />
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
          <RevisionPanel docId={doc?.id} onClose={() => setShowHistory(false)} onRestored={refreshOutline} modal />
        </div>
      )}
    </div>
  )
}
