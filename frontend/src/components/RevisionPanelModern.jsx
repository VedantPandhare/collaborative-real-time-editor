import { useEffect, useState } from 'react'
import { Clock, Eye, History, Loader2, RotateCcw, X } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { getRevision, getRevisions, restoreRevision } from '../lib/api'

export default function RevisionPanelModern({ docId, onClose, onRestored, modal = false }) {
  const [revisions, setRevisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!docId) return
    setLoading(true)
    getRevisions(docId)
      .then((rows) => {
        setRevisions(rows)
        setSelected(rows[0] || null)
      })
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false))
  }, [docId])

  useEffect(() => {
    if (!docId || !selected?.id) return
    setPreviewLoading(true)
    getRevision(docId, selected.id)
      .then(({ revision }) => setPreview(revision))
      .catch(() => setPreview(selected))
      .finally(() => setPreviewLoading(false))
  }, [docId, selected])

  const restore = async (rev) => {
    if (!window.confirm(`Restore this version from ${format(new Date(rev.created_at * 1000), 'PPpp')}?\n\nCurrent content will be overwritten.`)) return
    setRestoring(true)
    try {
      await restoreRevision(docId, rev.id)
      onRestored?.(rev)
      window.location.reload()
    } catch (_) {
      alert('Failed to restore revision')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className={`flex flex-col ${modal ? 'w-full max-w-5xl max-h-[85vh] rounded-[28px] bg-[#1c1f24] border border-[#343942] shadow-2xl shadow-black/50 overflow-hidden' : 'h-full bg-[#1c1f24] border-l border-[#343942]'}`}>
      <div className="flex items-center justify-between border-b border-[#343942] bg-[#252a31] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent-color/20 bg-accent-soft">
            <History size={18} className="text-accent-color" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Version History</p>
            <p className="text-xs text-text-secondary">Review and restore document snapshots</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 text-text-secondary hover:bg-white/[0.05] hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[340px_1fr]">
        <div className="min-h-0 overflow-y-auto border-r border-[#343942] bg-[#171a1f] p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-text-secondary">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : revisions.length === 0 ? (
            <div className="rounded-2xl border border-[#343942] bg-[#22262d] p-6 text-center">
              <Clock size={20} className="mx-auto mb-3 text-text-muted" />
              <p className="text-sm font-medium text-white">No revisions yet</p>
              <p className="mt-1 text-xs text-text-secondary">Snapshots are created automatically while you edit.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {revisions.map((rev, index) => {
                const active = selected?.id === rev.id
                return (
                  <button
                    key={rev.id}
                    onClick={() => setSelected(rev)}
                    className={`w-full rounded-2xl border p-3 text-left transition-all ${active ? 'border-accent-color/30 bg-accent-soft/30' : 'border-[#343942] bg-[#22262d] hover:bg-[#2a3038]'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 h-2.5 w-2.5 rounded-full ${active ? 'bg-accent-color' : 'bg-white/20'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{rev.title || 'Untitled revision'}</p>
                          {index === 0 ? <span className="rounded-full bg-accent-color px-2 py-0.5 text-[10px] font-bold text-white">Latest</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">
                          {formatDistanceToNow(new Date(rev.created_at * 1000), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto bg-[#20242b] p-5">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-text-secondary">Select a revision to inspect it.</div>
          ) : previewLoading ? (
            <div className="flex h-full items-center justify-center text-text-secondary">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-[#343942] bg-[#252a31] px-4 py-3">
                <div>
                  <p className="text-base font-semibold text-white">{preview?.title || selected.title || 'Untitled revision'}</p>
                  <p className="mt-1 text-xs text-text-secondary">{format(new Date(selected.created_at * 1000), 'PPP p')}</p>
                </div>
                <button
                  onClick={() => restore(selected)}
                  disabled={restoring}
                  className="inline-flex items-center gap-2 rounded-xl border border-accent-color/20 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-color hover:bg-accent-soft/70 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  {restoring ? 'Restoring...' : 'Restore version'}
                </button>
              </div>

              <div className="rounded-[28px] border border-[#343942] bg-[#1a1d23] p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                  <Eye size={12} />
                  Preview
                </div>
                <div className="rounded-[24px] border border-[#343942] bg-[#0f1115] p-6">
                  <div className="mx-auto max-w-[760px] whitespace-pre-wrap break-words text-[15px] leading-8 text-text-primary">
                    {preview?.content || selected.content || '(empty revision)'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
