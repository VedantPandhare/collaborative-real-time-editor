import { useEffect, useRef, useState } from 'react'
import {
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code2, Minus, Sparkles, Wand2, Zap
} from 'lucide-react'

const COMMANDS = [
  { 
    label: 'Summarize', 
    icon: Sparkles, 
    desc: 'AI summary of the page', 
    isAI: true,
    action: (q, i, ai) => ai.summarize() 
  },
  { 
    label: 'Continue writing', 
    icon: Zap, 
    desc: 'AI predicts what comes next', 
    isAI: true,
    action: (q, i, ai) => ai.continueWriting() 
  },
  { 
    label: 'Refine text', 
    icon: Wand2, 
    desc: 'AI improves selected text', 
    isAI: true,
    action: (q, i, ai) => ai.refine() 
  },
  { label: 'Heading 1',    icon: Heading1,    desc: 'Large section heading',   action: (q) => q.format('header', 1) },
  { label: 'Heading 2',    icon: Heading2,    desc: 'Medium section heading',  action: (q) => q.format('header', 2) },
  { label: 'Heading 3',    icon: Heading3,    desc: 'Small section heading',   action: (q) => q.format('header', 3) },
  { label: 'Bullet List',  icon: List,        desc: 'Create a simple list',    action: (q) => q.format('list', 'bullet') },
  { label: 'Ordered List', icon: ListOrdered, desc: 'Create a numbered list',  action: (q) => q.format('list', 'ordered') },
  { label: 'Quote',        icon: Quote,       desc: 'Capture a quote',         action: (q) => q.format('blockquote', true) },
  { label: 'Code Block',   icon: Code2,       desc: 'Capture a code snippet',  action: (q) => q.format('code-block', true) },
  { label: 'Divider',      icon: Minus,       desc: 'Insert a horizontal rule',action: (q, i) => q.insertText(i, '\n---\n') },
]

export default function SlashMenu({ position, query, onSelect, onClose }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const menuRef = useRef(null)

  const filtered = COMMANDS.filter(c =>
    !query || c.label.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % filtered.length) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + filtered.length) % filtered.length) }
      else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) onSelect(filtered[activeIdx]) }
      else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [filtered, activeIdx, onSelect, onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="slash-menu animate-slide-up"
      style={{ position: 'fixed', left: position.x, top: position.y }}
    >
      <div className="px-3 py-1.5 border-b border-white/[0.05] mb-1">
        <p className="text-[10px] font-bold text-muted uppercase tracking-[0.1em] opacity-50">Actions</p>
      </div>
      <div className="max-h-[320px] overflow-y-auto pr-1">
        {filtered.map((cmd, i) => (
          <div
            key={cmd.label}
            className={`slash-menu-item ${i === activeIdx ? 'active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
            onMouseEnter={() => setActiveIdx(i)}
          >
            <div className="icon">
              <cmd.icon size={16} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-white">{cmd.label}</p>
                {cmd.isAI && <span className="ai-pill">AI</span>}
              </div>
              <p className="text-[11px] text-white/40 leading-tight mt-0.5">{cmd.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
