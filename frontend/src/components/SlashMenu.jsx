import { useEffect, useRef, useState } from 'react'
import {
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code2, Minus, Table2
} from 'lucide-react'

const COMMANDS = [
  { label: 'Heading 1',    icon: Heading1,    desc: 'Large section heading',   action: (q, i) => { q.deleteText(i - 1, 1); q.format('header', 1) } },
  { label: 'Heading 2',    icon: Heading2,    desc: 'Medium section heading',  action: (q, i) => { q.deleteText(i - 1, 1); q.format('header', 2) } },
  { label: 'Heading 3',    icon: Heading3,    desc: 'Small section heading',   action: (q, i) => { q.deleteText(i - 1, 1); q.format('header', 3) } },
  { label: 'Bullet List',  icon: List,        desc: 'Create a simple list',    action: (q, i) => { q.deleteText(i - 1, 1); q.format('list', 'bullet') } },
  { label: 'Ordered List', icon: ListOrdered, desc: 'Create a numbered list',  action: (q, i) => { q.deleteText(i - 1, 1); q.format('list', 'ordered') } },
  { label: 'Quote',        icon: Quote,       desc: 'Capture a quote',         action: (q, i) => { q.deleteText(i - 1, 1); q.format('blockquote', true) } },
  { label: 'Code Block',   icon: Code2,       desc: 'Capture a code snippet',  action: (q, i) => { q.deleteText(i - 1, 1); q.format('code-block', true) } },
  { label: 'Divider',      icon: Minus,       desc: 'Insert a horizontal rule',action: (q, i) => { q.deleteText(i - 1, 1); q.insertText(i - 1, '\n---\n') } },
  { label: 'Table',        icon: Table2,      desc: 'Insert a simple table',   action: (q, i) => { q.deleteText(i - 1, 1); q.insertText(i - 1, '\nCol 1\tCol 2\tCol 3\nData 1\tData 2\tData 3\n') } },
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
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, activeIdx, onSelect, onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="slash-menu animate-slide-up"
      style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 1000 }}
    >
      <p className="text-[9px] text-notion-border uppercase tracking-widest px-2 pt-1 pb-0.5">Basic blocks</p>
      {filtered.map((cmd, i) => (
        <div
          key={cmd.label}
          className={`slash-menu-item ${i === activeIdx ? 'active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
          onMouseEnter={() => setActiveIdx(i)}
        >
          <div className="icon">
            <cmd.icon size={14} className="text-notion-silver" />
          </div>
          <div>
            <p className="text-xs font-medium text-notion-text">{cmd.label}</p>
            <p className="text-[10px] text-notion-muted">{cmd.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
