import { useCallback } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Code2,
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Link, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'

const Divider = () => <div className="w-px h-5 bg-notion-border mx-1" />

function ToolBtn({ icon: Icon, label, active, onClick, disabled }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick?.() }}
      disabled={disabled}
      title={label}
      className={`
        tooltip w-7 h-7 flex items-center justify-center rounded transition-all
        ${active
          ? 'bg-notion-hover text-notion-shine'
          : 'text-notion-silver hover:bg-notion-hover hover:text-notion-text'
        }
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
      data-tip={label}
    >
      <Icon size={14} />
    </button>
  )
}

export default function Toolbar({ getQuill, focusMode, onToggleFocus }) {
  const fmt = useCallback((format, value = true) => {
    const q = getQuill()
    if (!q) return
    const current = q.getFormat()
    q.format(format, current[format] === value ? false : value, 'user')
    q.focus()
  }, [getQuill])

  const getFormat = useCallback((format) => {
    const q = getQuill()
    if (!q) return false
    const sel = q.getSelection()
    if (!sel) return false
    return q.getFormat(sel.index, sel.length)[format]
  }, [getQuill])

  const insertLink = useCallback(() => {
    const q = getQuill()
    if (!q) return
    const sel = q.getSelection()
    if (!sel) return
    const url = window.prompt('Enter URL:')
    if (url) q.format('link', url, 'user')
  }, [getQuill])

  return (
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-notion-border bg-notion-surface/80 backdrop-blur-sm">
      {/* Text style */}
      <ToolBtn icon={Bold}          label="Bold (Ctrl+B)"      active={getFormat('bold')}        onClick={() => fmt('bold')} />
      <ToolBtn icon={Italic}        label="Italic (Ctrl+I)"    active={getFormat('italic')}      onClick={() => fmt('italic')} />
      <ToolBtn icon={Underline}     label="Underline (Ctrl+U)" active={getFormat('underline')}   onClick={() => fmt('underline')} />
      <ToolBtn icon={Strikethrough} label="Strikethrough"      active={getFormat('strike')}      onClick={() => fmt('strike')} />
      <ToolBtn icon={Code2}         label="Inline Code"        active={getFormat('code')}        onClick={() => fmt('code')} />

      <Divider />

      {/* Headings */}
      <ToolBtn icon={Heading1} label="Heading 1" active={getFormat('header') === 1} onClick={() => fmt('header', 1)} />
      <ToolBtn icon={Heading2} label="Heading 2" active={getFormat('header') === 2} onClick={() => fmt('header', 2)} />
      <ToolBtn icon={Heading3} label="Heading 3" active={getFormat('header') === 3} onClick={() => fmt('header', 3)} />

      <Divider />

      {/* Lists */}
      <ToolBtn icon={List}        label="Bullet List"   active={getFormat('list') === 'bullet'}  onClick={() => fmt('list', 'bullet')} />
      <ToolBtn icon={ListOrdered} label="Ordered List"  active={getFormat('list') === 'ordered'} onClick={() => fmt('list', 'ordered')} />
      <ToolBtn icon={Quote}       label="Blockquote"    active={getFormat('blockquote')}         onClick={() => fmt('blockquote')} />

      <Divider />

      {/* Alignment */}
      <ToolBtn icon={AlignLeft}   label="Left"   active={!getFormat('align')}            onClick={() => fmt('align', '')} />
      <ToolBtn icon={AlignCenter} label="Center" active={getFormat('align') === 'center'} onClick={() => fmt('align', 'center')} />
      <ToolBtn icon={AlignRight}  label="Right"  active={getFormat('align') === 'right'}  onClick={() => fmt('align', 'right')} />

      <Divider />
      <ToolBtn icon={Link} label="Insert Link" active={false} onClick={insertLink} />

      <div className="flex-1" />

      {/* Focus mode */}
      <button
        onClick={onToggleFocus}
        className={`
          text-xs px-2.5 py-1 rounded transition-all font-medium
          ${focusMode
            ? 'bg-notion-hover text-notion-shine border border-notion-border'
            : 'text-notion-muted hover:text-notion-silver hover:bg-notion-hover'
          }
        `}
        title="Toggle Focus Mode"
      >
        {focusMode ? 'Exit Focus' : 'Focus'}
      </button>
    </div>
  )
}
