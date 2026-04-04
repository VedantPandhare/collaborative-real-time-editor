import { useState, useRef } from 'react'
import { X, Sparkles, ChevronDown, Copy, Check, Loader2 } from 'lucide-react'
import { streamAI } from '../lib/api'

const ACTIONS = [
  { id: 'summarize', label: 'Summarize', emoji: '📝', desc: 'Condense into key points' },
  { id: 'explain', label: 'Explain', emoji: '💡', desc: 'Explain in simple terms' },
  { id: 'improve', label: 'Improve Writing', emoji: '✨', desc: 'Enhance clarity & style' },
  { id: 'bullets', label: 'To Bullets', emoji: '•', desc: 'Convert to bullet points' },
  { id: 'translate', label: 'Translate (ES)', emoji: '🌐', desc: 'Translate to Spanish' },
]

export default function AIPanel({ onClose, getQuill }) {
  const [action, setAction] = useState(ACTIONS[0])
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showActions, setShowActions] = useState(false)
  const abortRef = useRef(false)

  const getSelectedText = () => {
    const quill = getQuill()
    if (!quill) return ''
    const sel = quill.getSelection()
    if (!sel || sel.length === 0) return quill.getText()
    return quill.getText(sel.index, sel.length)
  }

  const run = async () => {
    const text = getSelectedText()
    if (!text.trim()) { setError('Select some text or place your cursor in the document.'); return }
    setError('')
    setResult('')
    setLoading(true)
    abortRef.current = false

    const actionId = action.id === 'custom' ? customPrompt : action.id

    try {
      await streamAI(text.trim(), actionId, (chunk) => {
        if (abortRef.current) return
        setResult(r => r + chunk)
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const insertResult = () => {
    const quill = getQuill()
    if (!quill || !result) return
    const sel = quill.getSelection()
    const idx = sel ? sel.index + sel.length : quill.getLength() - 1
    quill.insertText(idx, '\n' + result, 'user')
    quill.focus()
  }

  return (
    <div className="flex flex-col h-full bg-notion-surface border-l border-notion-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-notion-silver" />
          <span className="text-sm font-medium text-notion-text">AI Assistant</span>
        </div>
        <button onClick={onClose} className="text-notion-muted hover:text-notion-text transition-colors p-1 rounded hover:bg-notion-hover">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Action selector */}
        <div>
          <p className="text-[10px] text-notion-muted uppercase tracking-wider mb-2 font-medium">Action</p>
          <div className="relative">
            <button
              onClick={() => setShowActions(s => !s)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-notion-bg border border-notion-border rounded-lg text-sm text-notion-text hover:border-notion-accent transition-all"
            >
              <span className="flex items-center gap-2">
                <span>{action.emoji}</span>
                <span>{action.label}</span>
              </span>
              <ChevronDown size={12} className={`text-notion-muted transition-transform ${showActions ? 'rotate-180' : ''}`} />
            </button>
            {showActions && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-notion-surface border border-notion-border rounded-lg p-1 z-50 shadow-xl animate-slide-up">
                {ACTIONS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { setAction(a); setShowActions(false) }}
                    className={`w-full flex items-start gap-2 px-2.5 py-2 rounded hover:bg-notion-hover text-left transition-colors ${action.id === a.id ? 'bg-notion-hover' : ''}`}
                  >
                    <span className="text-sm">{a.emoji}</span>
                    <div>
                      <p className="text-xs font-medium text-notion-text">{a.label}</p>
                      <p className="text-[10px] text-notion-muted">{a.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Custom prompt */}
        <div>
          <p className="text-[10px] text-notion-muted uppercase tracking-wider mb-2 font-medium">Custom instruction (optional)</p>
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="e.g. 'Rewrite in a formal tone' or 'Add more technical detail'"
            className="w-full bg-notion-bg border border-notion-border rounded-lg px-3 py-2 text-xs text-notion-text placeholder-notion-border outline-none focus:border-notion-silver transition-colors resize-none"
            rows={2}
          />
        </div>

        {/* Context hint */}
        <div className="text-[10px] text-notion-muted bg-notion-bg border border-notion-border rounded-lg p-2.5">
          <strong className="text-notion-silver">Tip:</strong> Select text in the editor to analyze just that portion, or leave unselected to analyze the whole document.
        </div>

        {/* Run button */}
        <button
          onClick={run}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-notion-hover border border-notion-border rounded-lg text-sm font-medium text-notion-text hover:bg-notion-surface hover:border-notion-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
            : <><Sparkles size={14} /> Run AI</>
          }
        </button>

        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-2.5">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-notion-muted uppercase tracking-wider font-medium">Result</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={copy}
                  className="flex items-center gap-1 text-[10px] text-notion-silver hover:text-notion-text px-2 py-1 rounded hover:bg-notion-hover transition-all"
                >
                  {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={insertResult}
                  className="flex items-center gap-1 text-[10px] text-notion-silver hover:text-notion-text px-2 py-1 rounded hover:bg-notion-hover transition-all"
                >
                  ↓ Insert
                </button>
              </div>
            </div>
            <div className="bg-notion-bg border border-notion-border rounded-lg p-3 text-xs text-notion-silver leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {result}
              {loading && <span className="inline-block w-1.5 h-3 bg-notion-silver ml-0.5 animate-[cursorBlink_1s_ease-in-out_infinite]" />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
