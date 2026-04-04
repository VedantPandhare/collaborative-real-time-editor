import { useEffect, useRef, useState } from 'react'
import {
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code2, Minus, Sparkles, Wand2, Zap, Table2, Highlighter,
} from 'lucide-react'

const COMMANDS = [
  // ── AI Commands ──────────────────────────────────────────────────────────
  {
    label: 'Summarize',
    icon: Sparkles,
    desc: 'AI writes a summary of the whole document',
    isAI: true,
    action: (q, i, ai) => ai.summarize(),
  },
  {
    label: 'Refine text',
    icon: Wand2,
    desc: 'AI improves the selected text quality',
    isAI: true,
    action: (q, i, ai) => ai.refine(),
  },
  {
    label: 'Continue writing',
    icon: Zap,
    desc: 'AI suggests what comes next (ghost preview)',
    isAI: true,
    action: (q, i, ai) => ai.continueWriting(),
  },
  {
    label: 'AI Bullets',
    icon: Sparkles,
    desc: 'AI converts selected text to bullet points',
    isAI: true,
    action: (q, i, ai) => ai.bullets(),
  },
  {
    label: 'AI Table',
    icon: Sparkles,
    desc: 'AI generates a table from selected text',
    isAI: true,
    action: (q, i, ai) => ai.table(),
  },

  // ── Formatting Commands ───────────────────────────────────────────────────
  { label: 'Heading 1',    icon: Heading1,    desc: 'Large section heading',    action: (q, i) => { q.insertText(i, '\n', 'user'); q.setSelection(i + 1); q.format('header', 1, 'user') } },
  { label: 'Heading 2',    icon: Heading2,    desc: 'Medium section heading',   action: (q, i) => { q.insertText(i, '\n', 'user'); q.setSelection(i + 1); q.format('header', 2, 'user') } },
  { label: 'Heading 3',    icon: Heading3,    desc: 'Small section heading',    action: (q, i) => { q.insertText(i, '\n', 'user'); q.setSelection(i + 1); q.format('header', 3, 'user') } },
  { label: 'Bullet List',  icon: List,        desc: 'Create an unordered list', action: (q, i) => { q.insertText(i, '\n', 'user'); q.setSelection(i + 1); q.format('list', 'bullet', 'user') } },
  { label: 'Ordered List', icon: ListOrdered, desc: 'Create a numbered list',   action: (q, i) => { q.insertText(i, '\n', 'user'); q.setSelection(i + 1); q.format('list', 'ordered', 'user') } },
  { label: 'Blockquote',   icon: Quote,       desc: 'Insert a callout quote',   action: (q, i) => { q.insertText(i, '\n', 'user'); q.setSelection(i + 1); q.format('blockquote', true, 'user') } },
  { label: 'Code Block',   icon: Code2,       desc: 'Insert a code snippet',    action: (q, i) => { q.insertText(i, '\n', 'user'); q.setSelection(i + 1); q.format('code-block', true, 'user') } },
  {
    label: 'Table',
    icon: Table2,
    desc: 'Insert a blank 3-column table',
    action: (q, i) => {
      const tableText = '\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n|          |          |          |\n|          |          |          |\n'
      q.insertText(i, tableText, 'user')
      q.setSelection(i + tableText.length)
    },
  },
  {
    label: 'Highlight',
    icon: Highlighter,
    desc: 'Highlight selected text in yellow',
    action: (q) => {
      const sel = q.getSelection()
      if (sel && sel.length > 0) {
        q.format('background', '#fbbf2440', 'user')
      }
    },
  },
  {
    label: 'Divider',
    icon: Minus,
    desc: 'Insert a horizontal rule',
    action: (q, i) => {
      q.insertText(i, '\n──────────────────────────────────\n', 'user')
      q.setSelection(i + 36)
    },
  },
]

// Group commands for display
const AI_COMMANDS = COMMANDS.filter(c => c.isAI)
const FORMAT_COMMANDS = COMMANDS.filter(c => !c.isAI)

export default function SlashMenu({ position, query, onSelect, onClose }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const menuRef = useRef(null)
  const activeItemRef = useRef(null)

  const filtered = COMMANDS.filter(c =>
    !query || c.label.toLowerCase().includes(query.toLowerCase()) || c.desc.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => { setActiveIdx(0) }, [query])

  // Scroll active item into view
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setActiveIdx(i => (i + 1) % filtered.length) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setActiveIdx(i => (i - 1 + filtered.length) % filtered.length) }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (filtered[activeIdx]) onSelect(filtered[activeIdx]) }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [filtered, activeIdx, onSelect, onClose])

  if (filtered.length === 0) {
    return (
      <div
        className="slash-menu animate-slide-up"
        style={{ position: 'fixed', left: position.x, top: position.y }}
      >
        <div className="px-3 py-6 text-center">
          <p className="text-[12px] text-white/30">No commands found for <span className="text-white/50">"{query}"</span></p>
        </div>
      </div>
    )
  }

  const showAISection = filtered.some(c => c.isAI)
  const showFormatSection = filtered.some(c => !c.isAI)

  let flatIdx = -1

  return (
    <div
      ref={menuRef}
      className="slash-menu animate-slide-up"
      style={{ position: 'fixed', left: position.x, top: position.y }}
    >
      <div className="max-h-[380px] overflow-y-auto">
        {/* AI Section */}
        {showAISection && (
          <>
            <div className="px-3 pt-3 pb-1">
              <p className="text-[10px] font-bold text-purple-400/70 uppercase tracking-[0.15em] flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                AI Actions
              </p>
            </div>
            {filtered.filter(c => c.isAI).map((cmd) => {
              flatIdx++
              const myIdx = flatIdx
              const isActive = myIdx === activeIdx
              return (
                <div
                  key={cmd.label}
                  ref={isActive ? activeItemRef : null}
                  className={`slash-menu-item ${isActive ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
                  onMouseEnter={() => setActiveIdx(myIdx)}
                >
                  <div className="icon" style={{ background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)' }}>
                    <cmd.icon size={15} style={{ color: '#a855f7' }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-white">{cmd.label}</p>
                      <span className="ai-pill">AI</span>
                    </div>
                    <p className="text-[11px] text-white/35 leading-tight mt-0.5">{cmd.desc}</p>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* Formatting Section */}
        {showFormatSection && (
          <>
            <div className={`px-3 ${showAISection ? 'pt-2' : 'pt-3'} pb-1`}>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/30"></span>
                Formatting
              </p>
            </div>
            {filtered.filter(c => !c.isAI).map((cmd) => {
              flatIdx++
              const myIdx = flatIdx
              const isActive = myIdx === activeIdx
              return (
                <div
                  key={cmd.label}
                  ref={isActive ? activeItemRef : null}
                  className={`slash-menu-item ${isActive ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
                  onMouseEnter={() => setActiveIdx(myIdx)}
                >
                  <div className="icon">
                    <cmd.icon size={15} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-white">{cmd.label}</p>
                    <p className="text-[11px] text-white/35 leading-tight mt-0.5">{cmd.desc}</p>
                  </div>
                </div>
              )
            })}
          </>
        )}

        <div className="h-2" />
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-white/[0.05] flex items-center gap-3">
        <span className="text-[10px] text-white/20 font-medium">↑↓ navigate</span>
        <span className="text-[10px] text-white/20 font-medium">↵ select</span>
        <span className="text-[10px] text-white/20 font-medium">Esc close</span>
      </div>
    </div>
  )
}
