import { useState } from 'react'
import { Download, ChevronDown, FileText, Code } from 'lucide-react'

function quillDeltaToMarkdown(quill) {
  if (!quill) return ''
  const ops = quill.getContents().ops
  let md = ''
  let listDepth = 0

  ops.forEach(op => {
    if (typeof op.insert === 'string') {
      let text = op.insert
      const attrs = op.attributes || {}

      if (attrs.header) {
        const prefix = '#'.repeat(attrs.header) + ' '
        md += prefix + text.replace(/\n/g, '') + '\n\n'
      } else if (attrs.blockquote) {
        md += '> ' + text.replace(/\n/g, '\n> ') + '\n\n'
      } else if (attrs['code-block']) {
        md += '```\n' + text + '\n```\n\n'
      } else if (attrs.list === 'bullet') {
        md += '- ' + text.replace(/\n/g, '') + '\n'
      } else if (attrs.list === 'ordered') {
        md += '1. ' + text.replace(/\n/g, '') + '\n'
      } else {
        let t = text
        if (attrs.bold) t = `**${t}**`
        if (attrs.italic) t = `*${t}*`
        if (attrs.underline) t = `<u>${t}</u>`
        if (attrs.code) t = `\`${t}\``
        if (attrs.link) t = `[${t}](${attrs.link})`
        md += t
      }
    }
  })
  return md
}

export default function ExportMenu({ getQuill, title }) {
  const [open, setOpen] = useState(false)

  const exportAs = (type) => {
    const quill = getQuill()
    if (!quill) return
    let content, mime, ext

    if (type === 'txt') {
      content = quill.getText()
      mime = 'text/plain'
      ext = 'txt'
    } else if (type === 'md') {
      content = quillDeltaToMarkdown(quill)
      mime = 'text/markdown'
      ext = 'md'
    } else if (type === 'html') {
      content = `<!DOCTYPE html>\n<html>\n<head><title>${title}</title></head>\n<body>\n${quill.root.innerHTML}\n</body>\n</html>`
      mime = 'text/html'
      ext = 'html'
    }

    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'document').replace(/[^a-z0-9]/gi, '_')}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-notion-muted hover:text-notion-silver px-2 py-1.5 rounded hover:bg-notion-hover transition-all"
      >
        <Download size={12} />
        Export
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-notion-surface border border-notion-border rounded-lg p-1 z-50 min-w-[160px] shadow-xl animate-slide-up">
          <button onClick={() => exportAs('txt')} className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs text-notion-silver hover:text-notion-text hover:bg-notion-hover transition-colors">
            <FileText size={12} />Plain Text (.txt)
          </button>
          <button onClick={() => exportAs('md')} className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs text-notion-silver hover:text-notion-text hover:bg-notion-hover transition-colors">
            <Code size={12} />Markdown (.md)
          </button>
          <button onClick={() => exportAs('html')} className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs text-notion-silver hover:text-notion-text hover:bg-notion-hover transition-colors">
            <Code size={12} />HTML (.html)
          </button>
        </div>
      )}
    </div>
  )
}
