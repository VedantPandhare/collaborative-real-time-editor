import { useState, useEffect } from 'react'
import { X, Clock, RotateCcw, ChevronRight } from 'lucide-react'
import { getRevisions, restoreRevision } from '../lib/api'
import { format } from 'date-fns'

export default function RevisionPanel({ docId, onClose, onRestored }) {
  const [revisions, setRevisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!docId) return
    getRevisions(docId)
      .then(setRevisions)
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false))
  }, [docId])

  const restore = async (rev) => {
    if (!window.confirm(`Restore this version from ${format(new Date(rev.created_at * 1000), 'PPpp')}?\n\nCurrent content will be overwritten.`)) return
    setRestoring(true)
    try {
      await restoreRevision(docId, rev.id)
      onRestored?.()
      onClose()
    } catch (_) {
      alert('Failed to restore revision')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-notion-surface border-l border-notion-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-notion-muted" />
          <span className="text-sm font-medium text-notion-text">History</span>
          <span className="text-xs text-notion-muted bg-notion-hover px-1.5 py-0.5 rounded">{revisions.length}</span>
        </div>
        <button onClick={onClose} className="text-notion-muted hover:text-notion-text p-1 rounded hover:bg-notion-hover">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-6 text-center text-notion-muted text-xs">Loading revisions…</div>
        )}
        {!loading && revisions.length === 0 && (
          <div className="p-6 text-center">
            <Clock size={20} className="text-notion-border mx-auto mb-2" />
            <p className="text-xs text-notion-muted">No snapshots yet</p>
            <p className="text-[10px] text-notion-border mt-1">Snapshots are created automatically every 2 minutes</p>
          </div>
        )}
        {revisions.map((rev, i) => {
          const date = new Date(rev.created_at * 1000)
          const isSelected = selected?.id === rev.id
          return (
            <div key={rev.id} className="border-b border-notion-border/50">
              <button
                onClick={() => setSelected(isSelected ? null : rev)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-notion-hover transition-colors ${isSelected ? 'bg-notion-hover' : ''}`}
              >
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-notion-border border border-notion-accent" />
                  {i < revisions.length - 1 && <div className="w-px h-6 bg-notion-border mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-notion-text">{rev.title}</p>
                  <p className="text-[10px] text-notion-muted">{format(date, 'MMM d, yyyy · HH:mm')}</p>
                </div>
                <ChevronRight size={12} className={`text-notion-muted flex-shrink-0 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
              </button>
              {isSelected && (
                <div className="px-4 pb-3 animate-fade-in">
                  <div className="bg-notion-bg border border-notion-border rounded-lg p-3 mb-2 max-h-32 overflow-y-auto">
                    <p className="text-[10px] text-notion-muted whitespace-pre-wrap leading-relaxed line-clamp-6">
                      {rev.content.slice(0, 400) || '(empty)'}
                      {rev.content.length > 400 && '…'}
                    </p>
                  </div>
                  <button
                    onClick={() => restore(rev)}
                    disabled={restoring}
                    className="flex items-center gap-1.5 text-xs text-notion-silver hover:text-notion-text px-3 py-1.5 rounded-md bg-notion-hover border border-notion-border hover:border-notion-accent transition-all disabled:opacity-50"
                  >
                    <RotateCcw size={11} />
                    {restoring ? 'Restoring…' : 'Restore this version'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Timeline slider (mini) */}
      {revisions.length > 1 && (
        <div className="border-t border-notion-border p-3">
          <p className="text-[10px] text-notion-muted mb-2">Timeline</p>
          <input
            type="range"
            min={0}
            max={revisions.length - 1}
            defaultValue={0}
            className="w-full accent-notion-silver"
            onChange={e => setSelected(revisions[parseInt(e.target.value)])}
          />
          <div className="flex justify-between text-[9px] text-notion-border mt-1">
            <span>Earliest</span>
            <span>Latest</span>
          </div>
        </div>
      )}
    </div>
  )
}
