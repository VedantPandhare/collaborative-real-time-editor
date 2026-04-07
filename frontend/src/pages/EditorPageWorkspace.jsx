import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { EditorContent } from '@tiptap/react'
import { MessageSquare, Sparkles, Clock, Check, NotebookPen, Users, Sun, Moon } from 'lucide-react'
import { aiCommand, getDoc, getSessionUser, streamAI, updateDocContent, updateDocTitle } from '../lib/api'
import { setLocalUser } from '../lib/colors'
import { useCollabEditor } from '../hooks/useCollabEditorEnhanced'
import PresenceBar from '../components/PresenceBar'
import Toolbar from '../components/ToolbarRich'
import ChatPanel from '../components/ChatPanel'
import RevisionPanel from '../components/RevisionPanelModern'
import RemoteCursors from '../components/RemoteCursorsTiptap'
import SelectionBubbleMenu from '../components/SelectionBubbleMenu'
import SlashMenu from '../components/SlashMenu'
import ExportMenu from '../components/ExportMenuModern'
import DocumentMap from '../components/DocumentMap'
import InlineNotice from '../components/InlineNotice'

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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function simpleMarkdownToHtml(text = '') {
  const lines = String(text).split('\n')
  let html = ''
  let inList = false

  const closeList = () => {
    if (inList) {
      html += '</ul>'
      inList = false
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      closeList()
      continue
    }

    const checklistMatch = line.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/)
    const bulletMatch = line.match(/^[-*]\s+(.*)$/)

    if (checklistMatch || bulletMatch) {
      if (!inList) {
        html += '<ul>'
        inList = true
      }
      const content = checklistMatch ? checklistMatch[2] : bulletMatch[1]
      html += `<li>${escapeHtml(content)}</li>`
      continue
    }

    closeList()
    html += `<p>${escapeHtml(line)}</p>`
  }

  closeList()
  return html || `<p>${escapeHtml(text)}</p>`
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
  const [slashMenu, setSlashMenu] = useState({ visible: false, x: 0, y: 0, query: '' })
  const [outline, setOutline] = useState([])
  const [activeOutlineIndex, setActiveOutlineIndex] = useState(null)
  const [showOutline, setShowOutline] = useState(true)
  const [ghostText, setGhostText] = useState('')
  const [ghostPos, setGhostPos] = useState({ top: 0, left: 0, maxWidth: 320 })
  const [pageTheme, setPageTheme] = useState(() => window.localStorage.getItem('page-theme') || 'light')
  const [notice, setNotice] = useState({ tone: 'info', message: '' })
  const [saveState, setSaveState] = useState('saved')

  const titleTimerRef = useRef(null)
  const contentTimerRef = useRef(null)
  const autocompleteTimerRef = useRef(null)
  const abortControllerRef = useRef(null)
  const isAutocompletingRef = useRef(false)
  const ghostCursorPosRef = useRef(null)
  const noticeTimerRef = useRef(null)
  const onChatMessage = useCallback((msg) => setChatMessages((prev) => [...prev, msg]), [])
  const onChatHistory = useCallback((history) => setChatMessages(history), [])
  const showNotice = useCallback((message, tone = 'error', timeout = 5000) => {
    setNotice({ message, tone })
    clearTimeout(noticeTimerRef.current)
    if (timeout > 0) {
      noticeTimerRef.current = setTimeout(() => {
        setNotice((current) => (current.message === message ? { tone: 'info', message: '' } : current))
      }, timeout)
    }
  }, [])

  const { connected, users, sendChat, updateLocalUser, getYdoc, getEditor, editor } = useCollabEditor({
    docId: doc?.id,
    readonly: false,
    initialContent: doc?.content || '',
    onContentChange: ({ html }) => {
      clearTimeout(contentTimerRef.current)
      if (!doc?.id) return
      setSaveState('saving')
      contentTimerRef.current = setTimeout(() => {
        updateDocContent(doc.id, html)
          .then(() => setSaveState('saved'))
          .catch((err) => {
            setSaveState('error')
            showNotice(err.message || 'We could not save your latest edits.', 'error')
          })
      }, 700)
    },
    onChatMessage,
    onChatHistory,
    onConnectionStatusChange: (isConnected) => {
      if (isConnected) {
        showNotice('Live collaboration reconnected.', 'success', 2500)
        return
      }
      showNotice('Live collaboration disconnected. We will keep trying to reconnect.', 'error', 0)
    },
    onConnectionError: (message) => {
      showNotice(message, 'error')
    },
  })

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

  const clearGhost = useCallback(() => {
    setGhostText('')
    ghostCursorPosRef.current = null
    const nextEditor = getEditor()
    nextEditor?.storage?.aiAutocomplete?.clearSuggestion?.()
  }, [getEditor])

  const updateGhostPosition = useCallback((position = null) => {
    const nextEditor = getEditor()
    if (!nextEditor) return
    const cursorPos = position ?? nextEditor.state.selection.from

    try {
      const coords = nextEditor.view.coordsAtPos(cursorPos)
      const pageEl = nextEditor.view.dom.closest('.tiptap-page') || nextEditor.view.dom
      const pageRect = pageEl.getBoundingClientRect()
      setGhostPos({
        top: coords.bottom + 6,
        left: coords.left,
        maxWidth: Math.max(220, pageRect.right - coords.left - 48),
      })
    } catch (_) {}
  }, [getEditor])

  const triggerAutocomplete = useCallback(async (force = false) => {
    const nextEditor = getEditor()
    if (!nextEditor || isAutocompletingRef.current) return
    if (!nextEditor.state.selection.empty) return

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    isAutocompletingRef.current = true
    ghostCursorPosRef.current = nextEditor.state.selection.from
    setGhostText('')
    updateGhostPosition(ghostCursorPosRef.current)
    setIsAiLoading(true)
    try {
      if (force) {
        await nextEditor.storage.aiAutocomplete?.requestSuggestion?.()
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setGhostText('')
        showNotice(err.message || 'AI continuation is unavailable right now.', 'error')
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      isAutocompletingRef.current = false
      setIsAiLoading(false)
    }
  }, [clearGhost, getEditor, updateGhostPosition])

  const acceptGhost = useCallback(() => {
    const nextEditor = getEditor()
    const cursorPos = ghostCursorPosRef.current
    if (!nextEditor || !ghostText || cursorPos == null) return
    nextEditor.commands.acceptSuggestion?.()
    clearGhost()
  }, [clearGhost, getEditor, ghostText])

  useEffect(() => {
    getDoc(token)
      .then((data) => {
        setDoc(data)
        setTitle(data.title || 'untitled')
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Document not found')
        setLoading(false)
      })
  }, [token])

  useEffect(() => {
    getSessionUser()
      .then(({ user }) => {
        const displayName = user?.email ? user.email.split('@')[0] : null
        if (!displayName) return
        const current = window.localStorage.getItem('user-color')
        setLocalUser(displayName, current || '#5cbce0')
        updateLocalUser(displayName, current || '#5cbce0')
      })
      .catch(() => {
        showNotice('Signed-in profile details could not be loaded. Collaboration will still work.', 'info')
      })
  }, [updateLocalUser])

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
    return () => {
      clearTimeout(contentTimerRef.current)
      clearTimeout(autocompleteTimerRef.current)
      clearTimeout(noticeTimerRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('page-theme', pageTheme)
  }, [pageTheme])

  useEffect(() => {
    if (!doc) return
    const timer = setInterval(() => {
      const nextEditor = getEditor()
      if (!nextEditor || nextEditor.__livedraftEnhanced) return
      nextEditor.__livedraftEnhanced = true

      const handleTextChange = () => {
        refreshOutline()
        const suggestion = nextEditor.storage.aiAutocomplete?.suggestion || ''
        if (suggestion) {
          ghostCursorPosRef.current = nextEditor.state.selection.from
          setGhostText(suggestion)
          updateGhostPosition(nextEditor.state.selection.from)
        } else {
          setGhostText('')
        }

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
        if (!selection.empty) return
        autocompleteTimerRef.current = setTimeout(() => {
          if (!isAutocompletingRef.current) {
            nextEditor.storage.aiAutocomplete?.requestSuggestion?.()
          }
        }, 1800)
      }

      const handleSelectionChange = () => {
        refreshOutline()
        const suggestion = nextEditor.storage.aiAutocomplete?.suggestion || ''
        if (nextEditor.state.selection.empty) {
          if (suggestion) {
            ghostCursorPosRef.current = nextEditor.state.selection.from
            setGhostText(suggestion)
            updateGhostPosition(nextEditor.state.selection.from)
          }
        } else {
          clearTimeout(autocompleteTimerRef.current)
          clearGhost()
        }
      }

      nextEditor.on('update', handleTextChange)
      nextEditor.on('selectionUpdate', handleSelectionChange)
      refreshOutline()

      nextEditor.__livedraftCleanup = () => {
        nextEditor.off('update', handleTextChange)
        nextEditor.off('selectionUpdate', handleSelectionChange)
        delete nextEditor.__livedraftEnhanced
      }
    }, 150)

    return () => {
      clearInterval(timer)
      const nextEditor = getEditor()
      nextEditor?.__livedraftCleanup?.()
    }
  }, [clearGhost, doc, getEditor, ghostText, refreshOutline, triggerAutocomplete, updateGhostPosition])

  const runAiTransform = useCallback(async (action, { mode = 'append', label = 'AI Suggestion:' } = {}) => {
    const nextEditor = getEditor()
    if (!nextEditor) return
    abortControllerRef.current?.abort()
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
    } catch (err) {
      showNotice(err.message || 'AI action failed. Please try again.', 'error')
    } finally {
      setIsAiLoading(false)
    }
  }, [clearGhost, getEditor, insertAiBlock, showNotice])

  const runAiCommand = useCallback(async ({
    instruction,
    requireSelection = true,
    mode = 'append',
    label = 'AI Suggestion:',
    renderMarkdown = false,
  }) => {
    const nextEditor = getEditor()
    if (!nextEditor) return

    abortControllerRef.current?.abort()
    clearGhost()

    const selection = nextEditor.state.selection
    const selectedText = selection.from !== selection.to
      ? nextEditor.state.doc.textBetween(selection.from, selection.to, '\n', '\n')
      : ''

    if (requireSelection && !selectedText.trim()) {
      showNotice('Please select text first.', 'info')
      return
    }

    const documentText = nextEditor.getText().trim()
    setIsAiLoading(true)
    try {
      const output = await aiCommand(instruction, selectedText, documentText)
      if (!output.trim()) return
      const finalOutput = renderMarkdown ? simpleMarkdownToHtml(output) : output

      if (mode === 'replace') {
        nextEditor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, finalOutput).run()
      } else if (mode === 'insert-after-selection') {
        if (renderMarkdown) {
          nextEditor.chain().focus().insertContent(`
            <blockquote>
              <p><strong><em>${label}</em></strong></p>
              ${finalOutput}
            </blockquote>
            <p></p>
          `).run()
        } else {
          insertAiBlock(label, finalOutput, selection.to)
        }
      } else if (mode === 'insert-after-cursor') {
        nextEditor.chain().focus().insertContentAt(selection.to, renderMarkdown ? finalOutput : ` ${finalOutput}`).run()
      } else {
        insertAiBlock(label, finalOutput, selection.to)
      }
    } catch (err) {
      showNotice(err.message || 'AI action failed. Please try again.', 'error')
    } finally {
      setIsAiLoading(false)
    }
  }, [clearGhost, getEditor, insertAiBlock, showNotice])

  const aiActionsRef = useRef(null)
  aiActionsRef.current = {
    summarize: () => {
      const nextEditor = getEditor()
      const selection = nextEditor?.state.selection
      if (!nextEditor || !selection || selection.from === selection.to) {
        showNotice('Please select text to summarize.', 'info')
        return
      }
      return runAiTransform('summarize', { mode: 'append', label: 'AI Summary:' })
    },
    refine: () => {
      const nextEditor = getEditor()
      const selection = nextEditor?.state.selection
      if (!nextEditor || !selection || selection.from === selection.to) {
        showNotice('Please select text to refine.', 'info')
        return
      }
      return runAiTransform('improve', { mode: 'replace', label: 'AI Refinement:' })
    },
    professionalRephrase: () => {
      const nextEditor = getEditor()
      const selection = nextEditor?.state.selection
      if (!nextEditor || !selection || selection.from === selection.to) {
        showNotice('Please select text to rephrase.', 'info')
        return
      }
      return runAiTransform('professional', { mode: 'replace', label: 'AI Professional Rephrase:' })
    },
    translateHindi: () => runAiCommand({
      instruction: 'Translate the selected text to professional Hindi while preserving technical terms in English where appropriate.',
      requireSelection: true,
      mode: 'insert-after-selection',
      label: 'Hindi Translation:',
    }),
    extractActionItems: () => runAiCommand({
      instruction: 'Extract a list of actionable tasks or next steps from the selected text as a concise checklist.',
      requireSelection: true,
      mode: 'insert-after-selection',
      label: 'Action Items:',
      renderMarkdown: true,
    }),
    brainstormIdeas: () => runAiCommand({
      instruction: 'Provide five unique and creative ideas or extensions related to the selected topic.',
      requireSelection: true,
      mode: 'insert-after-selection',
      label: 'AI Brainstorm:',
      renderMarkdown: true,
    }),
    codeCritic: () => runAiCommand({
      instruction: 'Analyze the selected code or technical text and provide brief, punchy suggestions for improvement or potential bug fixes.',
      requireSelection: true,
      mode: 'insert-after-selection',
      label: 'Code Critic:',
    }),
    toneAnalysis: () => runAiCommand({
      instruction: 'Analyze the tone of the selected text and provide a concise one-sentence summary.',
      requireSelection: true,
      mode: 'insert-after-selection',
      label: 'Tone Analysis:',
    }),
    continueWriting: async () => {
      await triggerAutocomplete(true)
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
    setSaveState('saving')
    titleTimerRef.current = setTimeout(() => {
      updateDocTitle(doc?.id, nextTitle)
        .then(() => setSaveState('saved'))
        .catch((err) => {
          setSaveState('error')
          showNotice(err.message || 'The document title could not be saved.', 'error')
        })
    }, 600)
  }, [doc?.id, getYdoc, showNotice])

  const handleSlashSelect = useCallback((command) => {
    const nextEditor = getEditor()
    if (!nextEditor) return
    abortControllerRef.current?.abort()
    clearGhost()
    const selection = nextEditor.state.selection
    const text = nextEditor.state.doc.textBetween(0, selection.from, '\n', '\n')
    const lastSlash = text.lastIndexOf('/')
    if (lastSlash !== -1) {
      nextEditor.chain().focus().deleteRange({ from: selection.from - (selection.from - lastSlash), to: selection.from }).run()
    }

    setSlashMenu((current) => ({ ...current, visible: false }))

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

  const collaboratorCount = Math.max(1, users.length)

  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Tab' && ghostText) {
        event.preventDefault()
        acceptGhost()
      }

      if (event.key === 'Escape') {
        abortControllerRef.current?.abort()
        clearGhost()
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
  }, [acceptGhost, clearGhost, editor, ghostText])

  useEffect(() => {
    const syncGhostPosition = () => {
      if (ghostText && ghostCursorPosRef.current != null) {
        updateGhostPosition(ghostCursorPosRef.current)
      }
    }

    window.addEventListener('resize', syncGhostPosition)
    window.addEventListener('scroll', syncGhostPosition, true)
    return () => {
      window.removeEventListener('resize', syncGhostPosition)
      window.removeEventListener('scroll', syncGhostPosition, true)
    }
  }, [ghostText, updateGhostPosition])

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
          <button onClick={() => navigate('/app')} className="text-sm text-notion-muted hover:text-notion-text transition-colors">
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
            onClick={() => navigate('/app')}
            className="group flex shrink-0 items-center gap-3"
            title="Back to dashboard"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-accent-soft border border-accent-color/20 shadow-[0_14px_32px_rgba(59,130,246,0.18)] transition-transform group-hover:-translate-y-0.5">
              <NotebookPen size={22} className="text-accent-color" />
            </div>
            <div className="hidden pr-2 sm:flex sm:items-center">
              <p className="text-[1.65rem] font-semibold tracking-[-0.03em] text-white">LiveDraft</p>
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
            <span>{saveState === 'saving' ? 'Saving...' : saveState === 'error' ? 'Save failed' : 'Saved'}</span>
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

          <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-text-primary md:flex">
            <Users size={14} className="text-accent-color" />
            <span>{collaboratorCount} live</span>
          </div>

          <button
            onClick={() => setPageTheme((value) => (value === 'light' ? 'dark' : 'light'))}
            className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-white/[0.06] md:flex"
            title="Toggle page theme"
          >
            {pageTheme === 'light' ? <Moon size={14} className="text-text-secondary" /> : <Sun size={14} className="text-amber-300" />}
            <span>{pageTheme === 'light' ? 'Page light' : 'Page dark'}</span>
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

      <div className="relative z-30 px-4 pt-3 sm:px-6">
        <InlineNotice message={notice.message} tone={notice.tone} />
      </div>

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
              collaborators={collaboratorCount}
            />
          )}

        <div className="flex-1 flex">
          <div className="min-w-0 flex-1 flex-col gap-3">
            <div className="flex-1 rounded-[36px] border border-white/[0.05] bg-bg-secondary/55 shadow-[0_30px_60px_rgba(0,0,0,0.22)]">
              <div className="doc-canvas-bg mx-auto w-full max-w-[1100px] px-3 py-4 sm:px-6 sm:py-5">
                <div className="rounded-[34px] border border-white/[0.05] bg-bg-secondary p-3 shadow-[0_20px_44px_rgba(0,0,0,0.20)] sm:p-4">
                  <div className="rounded-[30px] border border-white/[0.05] bg-[#fffdfa08] px-2 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4 sm:py-4">
                    <div className="doc-paper-shell mx-auto w-full">
                      <div className={`doc-paper ${pageTheme === 'light' ? 'page-theme-light' : 'page-theme-dark'}`}>
                        <div className={`tiptap-page ${pageTheme === 'light' ? 'page-theme-light' : 'page-theme-dark'}`}>
                        <SelectionBubbleMenu
                          editor={editor}
                          onSummarize={() => aiActionsRef.current?.summarize?.()}
                          onRefine={() => aiActionsRef.current?.refine?.()}
                          onContinue={() => aiActionsRef.current?.continueWriting?.()}
                          onProfessional={() => aiActionsRef.current?.professionalRephrase?.()}
                          onTranslate={() => aiActionsRef.current?.translateHindi?.()}
                          onActionItems={() => aiActionsRef.current?.extractActionItems?.()}
                        />
                        <EditorContent editor={editor} className="h-full w-full" />
                      </div>
                      </div>
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
              <ChatPanel
                onClose={() => setShowChat(false)}
                sendChat={sendChat}
                messages={chatMessages}
                users={users}
                onError={(message) => showNotice(message, 'error')}
              />
            </div>
          )}
        </div>
      </div>

      {slashMenu.visible && (
        <SlashMenu
          position={{ x: slashMenu.x, y: slashMenu.y }}
          query={slashMenu.query}
          onSelect={handleSlashSelect}
          onClose={() => setSlashMenu((current) => ({ ...current, visible: false }))}
        />
      )}

      {ghostText && (
        <div
          className="ghost-suggestion"
          style={{
            position: 'fixed',
            top: ghostPos.top,
            left: ghostPos.left,
            maxWidth: `${ghostPos.maxWidth}px`,
            zIndex: 45,
            lineHeight: 1.7,
            fontSize: '16px',
          }}
        >
          <span className="ghost-suggestion-text">{ghostText}</span>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
          <RevisionPanel docId={doc?.id} onClose={() => setShowHistory(false)} onRestored={refreshOutline} modal />
        </div>
      )}
    </div>
  )
}
