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
const HIGHLIGHT_COLORS = ['#fef08a', '#bfdbfe', '#fecaca', '#bbf7d0']

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

function NativeSelect({ value, options, onChange, width = 'w-32', icon: Icon }) {
  return (
    <label className={`${width} relative flex h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm font-medium text-text-primary hover:bg-white/[0.05]`}>
      {Icon ? <Icon size={15} className="text-text-secondary shrink-0" /> : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full w-full appearance-none bg-transparent pr-6 outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#17191d] text-white">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" />
    </label>
  )
}

export default function Toolbar({ editor, showOutline = true, onToggleOutline, wordCount = 0 }) {
  const fileInputRef = useRef(null)
  const textColorInputRef = useRef(null)
  const highlightColorInputRef = useRef(null)
  const colorPopoverRef = useRef(null)
  const highlightPopoverRef = useRef(null)
  const [openPicker, setOpenPicker] = useState(null)

  if (!editor) {
    return <div className="h-[74px] border-b border-white/[0.05] bg-bg-secondary/95" />
  }

  useOutsideClose(colorPopoverRef, () => setOpenPicker((value) => value === 'color' ? null : value))
  useOutsideClose(highlightPopoverRef, () => setOpenPicker((value) => value === 'highlight' ? null : value))

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

  const sizeOptions = SIZE_OPTIONS.map((size) => ({ label: size, value: size }))

  return (
    <div className="sticky top-0 z-10 flex w-full flex-wrap items-center gap-2 border-b border-white/[0.05] bg-bg-secondary/95 px-4 py-3 shadow-sm backdrop-blur-xl">
      <IconBtn icon={showOutline ? PanelLeftClose : PanelLeftOpen} title="Toggle document map" onClick={onToggleOutline} />
      <Divider />
      <IconBtn icon={Undo2} title="Undo" onClick={() => editor.chain().focus().undo().run()} />
      <IconBtn icon={Redo2} title="Redo" onClick={() => editor.chain().focus().redo().run()} />
      <Divider />

      <NativeSelect
        value={headingLevel}
        options={BLOCK_OPTIONS}
        onChange={applyBlock}
        width="w-40"
      />

      <NativeSelect
        value={fontValue}
        options={FONT_OPTIONS}
        onChange={applyFont}
        width="w-36"
        icon={Type}
      />

      <NativeSelect
        value={sizeValue}
        options={sizeOptions}
        onChange={applySize}
        width="w-28"
      />

      <Divider />
      <IconBtn icon={Bold} title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <IconBtn icon={Italic} title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <IconBtn icon={Underline} title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <IconBtn icon={Strikethrough} title="Strike" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <IconBtn icon={Code2} title="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />

      <Divider />
      <div ref={colorPopoverRef} className="relative">
        <IconBtn title="Text color" onClick={() => setOpenPicker((value) => value === 'color' ? null : 'color')}>
          <span className="flex items-center gap-2">
            <Palette size={15} />
            <span className="h-4 w-4 rounded-md border border-white/[0.1]" style={{ backgroundColor: currentColor }} />
          </span>
        </IconBtn>
        {openPicker === 'color' ? (
          <div className="absolute left-1/2 top-full z-40 mt-2 w-48 -translate-x-1/2 rounded-2xl border border-white/[0.08] bg-[#17191d] p-3 shadow-2xl shadow-black/50">
            <div className="mb-3 grid grid-cols-3 gap-2">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    editor.chain().focus().setColor(color).run()
                    setOpenPicker(null)
                  }}
                  className="h-9 rounded-xl border border-white/[0.08]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                textColorInputRef.current?.click()
              }}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
            >
              Custom color
            </button>
            <input
              ref={textColorInputRef}
              type="color"
              value={currentColor}
              onChange={(event) => {
                editor.chain().focus().setColor(event.target.value).run()
                setOpenPicker(null)
              }}
              className="sr-only"
            />
          </div>
        ) : null}
      </div>

      <div ref={highlightPopoverRef} className="relative">
        <IconBtn title="Highlight" active={editor.isActive('highlight')} onClick={() => setOpenPicker((value) => value === 'highlight' ? null : 'highlight')}>
          <span className="flex items-center gap-2">
            <Highlighter size={15} />
            <span className="h-4 w-4 rounded-md border border-white/[0.1]" style={{ backgroundColor: currentHighlight }} />
          </span>
        </IconBtn>
        {openPicker === 'highlight' ? (
          <div className="absolute left-1/2 top-full z-40 mt-2 w-48 -translate-x-1/2 rounded-2xl border border-white/[0.08] bg-[#17191d] p-3 shadow-2xl shadow-black/50">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    editor.chain().focus().setHighlight({ color }).run()
                    setOpenPicker(null)
                  }}
                  className="h-9 rounded-xl border border-white/[0.08]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  editor.chain().focus().unsetHighlight().run()
                  setOpenPicker(null)
                }}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
              >
                Clear
              </button>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  highlightColorInputRef.current?.click()
                }}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
              >
                Custom
              </button>
            </div>
            <input
              ref={highlightColorInputRef}
              type="color"
              value={currentHighlight === '#111827' ? '#fef08a' : currentHighlight}
              onChange={(event) => {
                editor.chain().focus().setHighlight({ color: event.target.value }).run()
                setOpenPicker(null)
              }}
              className="sr-only"
            />
          </div>
        ) : null}
      </div>

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
