import { BubbleMenu } from '@tiptap/react'
import {
  Bold, Italic, Underline, Strikethrough, Highlighter, Code2,
  Sparkles, Wand2, Zap, Languages, ListTodo,
} from 'lucide-react'

function BubbleButton({ icon: Icon, label, active = false, onClick }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault()
        onClick?.()
      }}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
        active
          ? 'bg-accent-soft text-accent-color'
          : 'text-text-secondary hover:bg-white/[0.06] hover:text-text-primary'
      }`}
      title={label}
    >
      <Icon size={18} />
    </button>
  )
}

export default function SelectionBubbleMenu({
  editor,
  onSummarize,
  onRefine,
  onContinue,
  onProfessional,
  onTranslate,
  onActionItems,
  disabled = false,
}) {
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 150, placement: 'top', offset: [0, 14] }}
      shouldShow={({ editor: currentEditor, state }) => {
        const { from, to } = state.selection
        return currentEditor.isEditable && from !== to
      }}
    >
      <div className="selection-bubble-menu">
        <BubbleButton icon={Bold} label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <BubbleButton icon={Italic} label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <BubbleButton icon={Underline} label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <BubbleButton icon={Strikethrough} label="Strike" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <BubbleButton icon={Highlighter} label="Highlight" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()} />
        <BubbleButton icon={Code2} label="Code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />

        <div className="selection-bubble-divider" />

        <BubbleButton icon={Wand2} label="AI Refine" onClick={onRefine} />
        <BubbleButton icon={Sparkles} label="AI Professional Rewrite" onClick={onProfessional} />
        <BubbleButton icon={Sparkles} label="AI Summarize" onClick={onSummarize} />
        <BubbleButton icon={Zap} label="Continue Writing" onClick={onContinue} />
        <BubbleButton icon={Languages} label="Translate to Hindi" onClick={onTranslate} />
        <BubbleButton icon={ListTodo} label="Extract Action Items" onClick={onActionItems} />

        {disabled ? <span className="selection-bubble-hint">Select text</span> : null}
      </div>
    </BubbleMenu>
  )
}
