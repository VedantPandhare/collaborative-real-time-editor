import { useState } from 'react'
import { Download, ChevronDown, FileText, FileOutput } from 'lucide-react'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function sanitizeFileName(title) {
  return (title || 'untitled').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'untitled'
}

function buildDocxParagraphs(editor) {
  if (!editor) return []
  const items = []
  editor.state.doc.descendants((node) => {
    if (!node.isBlock) return
    const text = node.textContent || ''
    const alignmentMap = {
      center: AlignmentType.CENTER,
      right: AlignmentType.RIGHT,
      justify: AlignmentType.JUSTIFIED,
    }

    if (node.type.name === 'heading') {
      items.push(new Paragraph({
        text,
        heading: {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
        }[node.attrs.level] || HeadingLevel.HEADING_1,
      }))
      return
    }

    if (node.type.name === 'bulletList' || node.type.name === 'orderedList') return

    items.push(new Paragraph({
      children: [new TextRun({ text })],
      alignment: alignmentMap[node.attrs?.textAlign],
    }))
  })
  return items.length ? items : [new Paragraph({ text: editor.getText() })]
}

async function exportAsDocx(editor, title) {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'livedraft-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
        {
          children: buildDocxParagraphs(editor),
        },
      ],
  })

  const blob = await Packer.toBlob(doc)
  saveBlob(blob, `${sanitizeFileName(title)}.docx`)
}

function exportAsPdf(editor, title) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; margin: 48px; color: #111827; }
          h1, h2, h3 { margin: 1.25em 0 0.4em; }
          blockquote { margin: 1em 0; padding-left: 1em; border-left: 4px solid #cbd5e1; color: #475569; }
          pre { background: #f8fafc; padding: 16px; border-radius: 8px; overflow: auto; }
          code { font-family: "JetBrains Mono", monospace; }
        </style>
      </head>
      <body>
        <h1>${title || 'untitled'}</h1>
        ${editor.getHTML()}
      </body>
    </html>
  `

  const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
  }, 250)
}

export default function ExportMenu({ editor, title }) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const runExport = async (type) => {
    if (!editor) return
    setExporting(true)
    try {
      if (type === 'docx') {
        await exportAsDocx(editor, title)
      } else {
        exportAsPdf(editor, title)
      }
      setOpen(false)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-xs text-notion-muted hover:text-notion-silver px-2 py-1.5 rounded hover:bg-notion-hover transition-all"
      >
        <Download size={12} />
        Export
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-notion-surface border border-notion-border rounded-lg p-1 z-50 min-w-[180px] shadow-xl animate-slide-up">
          <button
            onClick={() => runExport('docx')}
            disabled={exporting}
            className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs text-notion-silver hover:text-notion-text hover:bg-notion-hover transition-colors disabled:opacity-50"
          >
            <FileText size={12} />
            Word (.docx)
          </button>
          <button
            onClick={() => runExport('pdf')}
            disabled={exporting}
            className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs text-notion-silver hover:text-notion-text hover:bg-notion-hover transition-colors disabled:opacity-50"
          >
            <FileOutput size={12} />
            PDF
          </button>
        </div>
      )}
    </div>
  )
}
