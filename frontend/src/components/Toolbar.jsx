import { useCallback } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Code2,
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Link, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Eraser,
  PanelLeftClose, PanelLeftOpen, Type,
} from 'lucide-react'

const Divider = () => <div className="w-[1px] h-4 bg-white/10 mx-1.5" />

function ToolGroup({ children }) {
  return (
    <div className="flex items-center bg-bg-tertiary/50 border border-white/[0.05] rounded-lg p-1">
      {children}
    </div>
  )
}

function ToolBtn({ icon: Icon, label, active, onClick, disabled }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick?.() }}
      disabled={disabled}
      title={label}
      className={`
        tooltip w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200
        ${active
          ? 'bg-accent-soft text-accent-color shadow-sm'
          : 'text-text-secondary hover:bg-white/10 hover:text-text-primary'
        }
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
      data-tip={label}
    >
      <Icon size={14} />
    </button>
  )
}

export default function Toolbar({ getQuill, focusMode, onToggleFocus, showOutline = true, onToggleOutline, wordCount = 0 }) {
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

  const runHistory = useCallback((direction) => {
    const q = getQuill()
    q?.history?.[direction]?.()
    q?.focus()
  }, [getQuill])

  const clearFormatting = useCallback(() => {
    const q = getQuill()
    if (!q) return
    const sel = q.getSelection()
    if (!sel) return
    if (sel.length > 0) {
      q.removeFormat(sel.index, sel.length, 'user')
    } else {
      q.formatText(sel.index, 1, {
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        code: false,
        link: false,
        color: false,
        background: false,
        header: false,
        blockquote: false,
        'code-block': false,
        list: false,
        align: false,
      }, 'user')
    }
    q.focus()
  }, [getQuill])

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/[0.05] bg-bg-secondary/95 w-full sticky top-0 z-10 shadow-sm backdrop-blur-xl">
      <button
        onClick={onToggleOutline}
        className="h-9 px-3 rounded-full border border-white/[0.06] bg-white/[0.03] text-text-secondary hover:text-text-primary hover:bg-white/[0.06] transition-all"
        title={showOutline ? 'Hide document map' : 'Show document map'}
      >
        {showOutline ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
      </button>

      <Divider />

      <div className="flex h-9 items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 text-xs font-semibold text-text-secondary">
        <Type size={14} className="text-accent-color" />
        <span>Editor</span>
      </div>

      <Divider />

      <ToolGroup>
        <ToolBtn icon={Undo2} label="Undo (Ctrl+Z)" active={false} onClick={() => runHistory('undo')} />
        <ToolBtn icon={Redo2} label="Redo (Ctrl+Y)" active={false} onClick={() => runHistory('redo')} />
      </ToolGroup>

      <Divider />

      <ToolGroup>
        <ToolBtn icon={Heading1} label="Heading 1" active={getFormat('header') === 1} onClick={() => fmt('header', 1)} />
        <ToolBtn icon={Heading2} label="Heading 2" active={getFormat('header') === 2} onClick={() => fmt('header', 2)} />
        <ToolBtn icon={Heading3} label="Heading 3" active={getFormat('header') === 3} onClick={() => fmt('header', 3)} />
      </ToolGroup>

      <Divider />

      <ToolGroup>
        <ToolBtn icon={Bold}          label="Bold (Ctrl+B)"      active={getFormat('bold')}        onClick={() => fmt('bold')} />
        <ToolBtn icon={Italic}        label="Italic (Ctrl+I)"    active={getFormat('italic')}      onClick={() => fmt('italic')} />
        <ToolBtn icon={Underline}     label="Underline (Ctrl+U)" active={getFormat('underline')}   onClick={() => fmt('underline')} />
        <ToolBtn icon={Strikethrough} label="Strikethrough"      active={getFormat('strike')}      onClick={() => fmt('strike')} />
      </ToolGroup>

      <Divider />

      <ToolGroup>
        <ToolBtn icon={AlignLeft}   label="Left Align"   active={!getFormat('align')}            onClick={() => fmt('align', '')} />
        <ToolBtn icon={AlignCenter} label="Center Align" active={getFormat('align') === 'center'} onClick={() => fmt('align', 'center')} />
        <ToolBtn icon={AlignRight}  label="Right Align"  active={getFormat('align') === 'right'}  onClick={() => fmt('align', 'right')} />
      </ToolGroup>

      <Divider />

      <ToolGroup>
        <ToolBtn icon={List}        label="Bullet List"   active={getFormat('list') === 'bullet'}  onClick={() => fmt('list', 'bullet')} />
        <ToolBtn icon={ListOrdered} label="Ordered List"  active={getFormat('list') === 'ordered'} onClick={() => fmt('list', 'ordered')} />
        <ToolBtn icon={Quote}       label="Blockquote"    active={getFormat('blockquote')}         onClick={() => fmt('blockquote')} />
        <ToolBtn icon={Code2}       label="Inline Code"   active={getFormat('code')}               onClick={() => fmt('code')} />
      </ToolGroup>

      <Divider />

      <ToolGroup>
        <ToolBtn icon={Link} label="Insert Link" active={false} onClick={insertLink} />
        <ToolBtn icon={Eraser} label="Clear Formatting" active={false} onClick={clearFormatting} />
      </ToolGroup>

      {/* Focus mode */}
      <button
        onClick={onToggleFocus}
        className={`
          text-xs px-3 py-1.5 rounded-lg transition-all font-semibold tracking-wide uppercase
          ${focusMode
            ? 'bg-accent-soft text-accent-color border border-accent-color/30'
            : 'text-text-secondary hover:text-white hover:bg-white/10'
          }
        `}
        title="Toggle Focus Mode"
      >
        {focusMode ? 'Exit Focus' : 'Focus'}
      </button>

      <div className="ml-auto flex h-9 items-center rounded-full border border-white/[0.06] bg-white/[0.03] px-3 text-xs font-semibold text-text-secondary">
        {wordCount} words
      </div>
    </div>
  )
}
