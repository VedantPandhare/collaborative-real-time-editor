import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Code2, Quote, Link2, ImagePlus,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, ListChecks,
  Undo2, Redo2, Eraser, Minus, Highlighter, PanelLeftClose, PanelLeftOpen,
  Table2, ChevronDown, Palette, Type, FilePlus2,
} from 'lucide-react'

const FONT_OPTIONS = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"JetBrains Mono", "Fira Code", monospace' },
]

const BLOCK_OPTIONS = [
  { label: 'Paragraph', value: 'paragraph' },
  { label: 'Heading 1', value: 'heading-1' },
  { label: 'Heading 2', value: 'heading-2' },
  { label: 'Heading 3', value: 'heading-3' },
]

const SIZE_OPTIONS = ['12px', '14px', '16px', '18px', '24px', '32px']
const TEXT_COLORS = ['#f0f1f3', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7']
const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bfdbfe', label: 'Blue' },
  { color: '#fecaca', label: 'Rose' },
  { color: '#bbf7d0', label: 'Mint' },
]

function Divider() {
  return <div className="mx-1 h-5 w-px bg-white/[0.08]" />
}

function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const handlePointer = (event) => {
      if (!ref.current?.contains(event.target)) onClose()
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [onClose, ref])
}

function IconBtn({ icon: Icon, title, active, onClick, children }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        onClick?.()
      }}
      className={`flex h-9 min-w-9 items-center justify-center rounded-full px-3 transition-colors ${
        active ? 'bg-accent-soft text-accent-color' : 'text-text-secondary hover:bg-white/[0.06] hover:text-text-primary'
      }`}
      title={title}
    >
      {Icon ? <Icon size={16} /> : children}
    </button>
  )
}

function MenuButton({ label, onClick, width = 'w-32', icon: Icon }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      className={`${width} flex h-11 items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm font-medium text-text-primary hover:bg-white/[0.05]`}
    >
      <span className="flex items-center gap-2 truncate">
        {Icon ? <Icon size={15} className="text-text-secondary" /> : null}
        <span className="truncate">{label}</span>
      </span>
      <ChevronDown size={15} className="text-text-secondary" />
    </button>
  )
}

function Dropdown({ button, children, open, onClose, width = 'w-52' }) {
  const ref = useRef(null)
  useOutsideClose(ref, onClose)
  return (
    <div ref={ref} className="relative">
      {button}
      {open ? (
        <div className={`absolute left-0 top-[calc(100%+10px)] z-40 ${width} rounded-2xl border border-white/[0.08] bg-[#17191d] p-2 shadow-2xl shadow-black/50`}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

export default function Toolbar({ editor, showOutline = true, onToggleOutline, wordCount = 0 }) {
  const fileInputRef = useRef(null)
  const [openMenu, setOpenMenu] = useState(null)

  if (!editor) {
    return <div className="h-[74px] border-b border-white/[0.05] bg-bg-secondary/95" />
  }

  const attrs = editor.getAttributes('textStyle')
  const headingLevel = editor.isActive('heading', { level: 1 }) ? 'heading-1'
    : editor.isActive('heading', { level: 2 }) ? 'heading-2'
    : editor.isActive('heading', { level: 3 }) ? 'heading-3'
    : 'paragraph'
  const fontValue = attrs.fontFamily || FONT_OPTIONS[0].value
  const sizeValue = attrs.fontSize || '16px'
  const currentColor = attrs.color || '#f0f1f3'
  const currentHighlight = editor.getAttributes('highlight').color || '#111827'

  const applyBlock = (value) => {
    const chain = editor.chain().focus()
    if (value === 'paragraph') chain.setParagraph().run()
    else chain.toggleHeading({ level: Number(value.slice(-1)) }).run()
    setOpenMenu(null)
  }

  const applyFont = (value) => {
    editor.chain().focus().setFontFamily(value).run()
    setOpenMenu(null)
  }

  const applySize = (value) => {
    editor.chain().focus().setFontSize(value).run()
    setOpenMenu(null)
  }

  const insertLink = () => {
    const url = window.prompt('Enter URL')
    if (!url) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const insertImage = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => editor.chain().focus().setImage({ src: reader.result }).run()
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const insertTable = () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  const insertDivider = () => editor.chain().focus().setHorizontalRule().run()
  const insertPageBreak = () => editor.chain().focus().insertContent('<p style="text-align:center;color:#94a3b8;"><em>Page Break</em></p><hr /><p></p>').run()
  const clearFormatting = () => editor.chain().focus().unsetAllMarks().clearNodes().run()

  const blockLabel = BLOCK_OPTIONS.find((item) => item.value === headingLevel)?.label || 'Paragraph'
  const fontLabel = FONT_OPTIONS.find((item) => item.value === fontValue)?.label || 'Inter'

  return (
    <div className="sticky top-0 z-10 flex w-full flex-wrap items-center gap-2 border-b border-white/[0.05] bg-bg-secondary/95 px-4 py-3 shadow-sm backdrop-blur-xl">
      <IconBtn icon={showOutline ? PanelLeftClose : PanelLeftOpen} title="Toggle document map" onClick={onToggleOutline} />
      <Divider />
      <IconBtn icon={Undo2} title="Undo" onClick={() => editor.chain().focus().undo().run()} />
      <IconBtn icon={Redo2} title="Redo" onClick={() => editor.chain().focus().redo().run()} />
      <Divider />

      <Dropdown
        open={openMenu === 'block'}
        onClose={() => setOpenMenu(null)}
        button={<MenuButton label={blockLabel} width="w-40" onClick={() => setOpenMenu((value) => value === 'block' ? null : 'block')} />}
      >
        {BLOCK_OPTIONS.map((option) => (
          <button key={option.value} type="button" onMouseDown={(event) => { event.preventDefault(); applyBlock(option.value) }} className={`toolbar-menu-item ${headingLevel === option.value ? 'active' : ''}`}>
            {option.label}
          </button>
        ))}
      </Dropdown>

      <Dropdown
        open={openMenu === 'font'}
        onClose={() => setOpenMenu(null)}
        button={<MenuButton label={fontLabel} width="w-36" icon={Type} onClick={() => setOpenMenu((value) => value === 'font' ? null : 'font')} />}
      >
        {FONT_OPTIONS.map((option) => (
          <button key={option.value} type="button" onMouseDown={(event) => { event.preventDefault(); applyFont(option.value) }} className={`toolbar-menu-item ${fontValue === option.value ? 'active' : ''}`}>
            {option.label}
          </button>
        ))}
      </Dropdown>

      <Dropdown
        open={openMenu === 'size'}
        onClose={() => setOpenMenu(null)}
        width="w-28"
        button={<MenuButton label={sizeValue} width="w-28" onClick={() => setOpenMenu((value) => value === 'size' ? null : 'size')} />}
      >
        {SIZE_OPTIONS.map((option) => (
          <button key={option} type="button" onMouseDown={(event) => { event.preventDefault(); applySize(option) }} className={`toolbar-menu-item ${sizeValue === option ? 'active' : ''}`}>
            {option}
          </button>
        ))}
      </Dropdown>

      <Divider />
      <IconBtn icon={Bold} title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <IconBtn icon={Italic} title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <IconBtn icon={Underline} title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <IconBtn icon={Strikethrough} title="Strike" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <IconBtn icon={Code2} title="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />

      <Divider />
      <Dropdown
        open={openMenu === 'color'}
        onClose={() => setOpenMenu(null)}
        width="w-52"
        button={<IconBtn title="Text color" onClick={() => setOpenMenu((value) => value === 'color' ? null : 'color')}><span className="flex items-center gap-2"><Palette size={15} /><span className="h-4 w-4 rounded-md border border-white/[0.1]" style={{ backgroundColor: currentColor }} /></span></IconBtn>}
      >
        <div className="grid grid-cols-3 gap-2 p-1">
          {TEXT_COLORS.map((color) => (
            <button key={color} type="button" onMouseDown={(event) => { event.preventDefault(); editor.chain().focus().setColor(color).run(); setOpenMenu(null) }} className="h-10 rounded-xl border border-white/[0.08]" style={{ backgroundColor: color }} />
          ))}
        </div>
      </Dropdown>

      <Dropdown
        open={openMenu === 'highlight'}
        onClose={() => setOpenMenu(null)}
        width="w-56"
        button={<IconBtn title="Highlight" active={editor.isActive('highlight')} onClick={() => setOpenMenu((value) => value === 'highlight' ? null : 'highlight')}><span className="flex items-center gap-2"><Highlighter size={15} /><span className="h-4 w-4 rounded-md border border-white/[0.1]" style={{ backgroundColor: currentHighlight }} /></span></IconBtn>}
      >
        <div className="space-y-1 p-1">
          {HIGHLIGHT_COLORS.map((entry) => (
            <button key={entry.label} type="button" onMouseDown={(event) => { event.preventDefault(); editor.chain().focus().toggleHighlight({ color: entry.color }).run(); setOpenMenu(null) }} className="toolbar-menu-item justify-between">
              <span>{entry.label}</span>
              <span className="h-5 w-5 rounded-md border border-white/[0.08]" style={{ backgroundColor: entry.color }} />
            </button>
          ))}
        </div>
      </Dropdown>

      <Divider />
      <IconBtn icon={List} title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <IconBtn icon={ListOrdered} title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <IconBtn icon={ListChecks} title="Checklist" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <IconBtn icon={Quote} title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />

      <Divider />
      <IconBtn icon={AlignLeft} title="Align left" active={!editor.isActive({ textAlign: 'center' }) && !editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
      <IconBtn icon={AlignCenter} title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
      <IconBtn icon={AlignRight} title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />

      <Divider />
      <IconBtn icon={Link2} title="Link" onClick={insertLink} />
      <IconBtn icon={ImagePlus} title="Image" onClick={() => fileInputRef.current?.click()} />
      <IconBtn icon={Table2} title="Table" onClick={insertTable} />
      <IconBtn icon={Code2} title="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <IconBtn icon={FilePlus2} title="Page break" onClick={insertPageBreak} />
      <IconBtn icon={Minus} title="Divider" onClick={insertDivider} />
      <IconBtn icon={Eraser} title="Clear formatting" onClick={clearFormatting} />

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={insertImage} />

      <div className="ml-auto flex h-10 items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 text-xs font-semibold text-text-secondary">
        {wordCount} words
      </div>
    </div>
  )
}
