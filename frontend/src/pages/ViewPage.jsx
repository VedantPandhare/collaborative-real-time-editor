import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, Clock } from 'lucide-react'
import { getDoc } from '../lib/api'
import { useCollabEditor } from '../hooks/useCollabEditor'
import { formatDistanceToNow } from 'date-fns'

export default function ViewPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [users, setUsersLocal] = useState([])
  const editorContainerRef = useRef(null)

  useEffect(() => {
    getDoc(token)
      .then(d => {
        if (!d.readonly && d.view_token !== token) {
          // It's an edit token, redirect to editor
          navigate(`/doc/${token}`)
          return
        }
        setDoc(d)
        setLoading(false)
      })
      .catch(() => {
        setError('Document not found or access denied.')
        setLoading(false)
      })
  }, [token, navigate])

  const { connected, users: collabUsers } = useCollabEditor({
    docId: doc?.id,
    containerRef: editorContainerRef,
    readonly: true,
  })

  useEffect(() => { setUsersLocal(collabUsers) }, [collabUsers])

  if (loading) {
    return (
      <div className="min-h-screen bg-notion-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-notion-border border-t-notion-silver rounded-full animate-spin" />
          <p className="text-sm text-notion-muted">Loading…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-notion-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-notion-text mb-2">{error}</p>
          <button onClick={() => navigate('/')} className="text-sm text-notion-muted hover:text-notion-text transition-colors">
            ← Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-notion-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-notion-border bg-notion-surface/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-1.5 rounded hover:bg-notion-hover text-notion-muted hover:text-notion-text transition-all">
              <ArrowLeft size={15} />
            </button>
            <h1 className="text-sm font-medium text-notion-text">{doc?.title || 'Untitled'}</h1>
            <span className="flex items-center gap-1 text-[10px] text-notion-muted bg-notion-hover border border-notion-border px-2 py-0.5 rounded">
              <Eye size={9} /> Read-only
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-notion-muted">
            {connected && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
            <Clock size={11} />
            {doc && formatDistanceToNow(new Date(doc.updated_at * 1000), { addSuffix: true })}
          </div>
        </div>
      </header>

      {/* Editor (readonly) */}
      <div className="max-w-3xl mx-auto">
        <div ref={editorContainerRef} className="pointer-events-none select-text" />
      </div>

      {/* Online editors count */}
      {collabUsers.length > 0 && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-notion-surface border border-notion-border rounded-full px-3 py-2 text-xs text-notion-muted shadow-xl">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          {collabUsers.length} editing live
        </div>
      )}
    </div>
  )
}
