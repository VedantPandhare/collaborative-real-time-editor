import { FileText, Hash, ChevronRight, Clock3 } from 'lucide-react'

function itemIndent(level) {
  if (level === 2) return 'pl-5'
  if (level >= 3) return 'pl-8'
  return 'pl-2'
}

export default function DocumentMap({ outline, activeIndex, onJump, wordCount = 0, collaborators = 0 }) {
  const minutes = Math.max(1, Math.ceil(wordCount / 200))

  return (
    <aside className="hidden lg:block w-[294px] flex-shrink-0">
      <div className="flex h-full flex-col rounded-[30px] border border-white/[0.05] bg-bg-secondary/70 p-4 shadow-[0_24px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl overflow-hidden">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-text-muted">Document map</p>
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-accent-soft text-accent-color">
              <Clock3 size={12} />
              <span className="text-[11px] font-semibold tabular-nums">{minutes} min read</span>
            </div>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-text-primary">Navigate your draft</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Jump between sections and keep your structure in view.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {outline.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/[0.08] bg-white/[0.03] p-4 text-sm text-text-muted">
            <div className="flex items-center gap-2 text-text-secondary">
              <FileText size={14} />
              <span>No headings yet</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed">
              Use Heading 1, Heading 2, or Heading 3 to build a live outline for the document.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {outline.map((item, index) => (
              <button
                key={`${item.index}-${index}`}
                onClick={() => onJump(item.index)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                  activeIndex === item.index
                    ? 'border-accent-color/40 bg-accent-soft text-text-primary'
                    : 'border-transparent text-text-secondary hover:border-white/[0.06] hover:bg-white/[0.03] hover:text-text-primary'
                }`}
              >
                <div className={`flex items-start gap-2 ${itemIndent(item.level)}`}>
                  <Hash size={13} className="mt-0.5 flex-shrink-0 text-accent-color" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.text}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                      <span>Page {item.page}</span>
                      <ChevronRight size={11} />
                      <span>H{item.level}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        </div>

        <div className="mt-4 rounded-[24px] border border-white/[0.05] bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-text-muted">Writing pace</p>
          <div className="mt-3 space-y-2 text-sm text-text-secondary">
            <p>{wordCount} words in this draft</p>
            <p>{outline.length} sections mapped</p>
            <p>{collaborators} collaborators live</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
