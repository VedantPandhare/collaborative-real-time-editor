import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Trash2, Clock, ChevronRight, Search, Users } from 'lucide-react'
import { listDocs, createDoc, deleteDoc } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'

const TEMPLATES = [
  { id: 'blank',      name: 'Blank page',    icon: '📄', content: '' },
  { id: 'meeting',    name: 'Meeting notes', icon: '📋', content: '# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n\n## Discussion\n\n## Action Items\n\n' },
  { id: 'doc',        name: 'Technical doc', icon: '⚙️',  content: '# Technical Documentation\n\n## Overview\n\n## Prerequisites\n\n## Installation\n\n## Usage\n\n## API Reference\n\n' },
  { id: 'brainstorm', name: 'Brainstorm',    icon: '💡', content: '# Brainstorm Session\n\n## Problem Statement\n\n## Ideas\n\n- \n- \n- \n\n## Next Steps\n\n' },
]

export default function Dashboard() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    listDocs()
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [])

  const newDoc = async (template = TEMPLATES[0]) => {
    setCreating(true)
    try {
      const doc = await createDoc(template.name === 'Blank page' ? 'Untitled' : template.name)
      navigate(`/doc/${doc.editToken}`, { state: { template } })
    } finally {
      setCreating(false)
    }
  }

  const remove = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Delete this document permanently?')) return
    await deleteDoc(id)
    setDocs(d => d.filter(doc => doc.id !== id))
  }

  const filtered = docs.filter(d =>
    d.title?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-notion-bg text-notion-text">
      {/* Top nav */}
      <header className="border-b border-notion-border bg-notion-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-notion-hover border border-notion-border rounded-lg flex items-center justify-center">
              <span className="text-sm">✏️</span>
            </div>
            <span className="font-semibold text-notion-text tracking-tight">Collab</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-notion-muted">
            <Users size={12} />
            <span>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-notion-shine mb-2 tracking-tight">Good to see you</h1>
          <p className="text-notion-muted text-sm">Create a document or pick up where you left off.</p>
        </div>

        {/* Templates */}
        <section className="mb-10">
          <h2 className="text-xs font-medium text-notion-muted uppercase tracking-widest mb-4">Start from template</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => newDoc(tpl)}
                disabled={creating}
                className="group flex flex-col items-start gap-2 p-4 bg-notion-surface border border-notion-border rounded-xl hover:border-notion-accent hover:bg-notion-hover transition-all text-left disabled:opacity-50"
              >
                <span className="text-2xl">{tpl.icon}</span>
                <span className="text-xs font-medium text-notion-silver group-hover:text-notion-text transition-colors">
                  {tpl.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* New doc button */}
        <button
          onClick={() => newDoc()}
          disabled={creating}
          className="flex items-center gap-2 mb-8 px-4 py-2.5 bg-notion-surface border border-notion-border rounded-lg text-sm font-medium text-notion-silver hover:text-notion-text hover:border-notion-accent hover:bg-notion-hover transition-all disabled:opacity-50"
        >
          <Plus size={14} />
          {creating ? 'Creating…' : 'New document'}
        </button>

        {/* Search */}
        {docs.length > 0 && (
          <div className="relative mb-6">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-notion-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="w-full bg-notion-surface border border-notion-border rounded-lg pl-9 pr-4 py-2 text-sm text-notion-text placeholder-notion-border outline-none focus:border-notion-silver transition-colors"
            />
          </div>
        )}

        {/* Document list */}
        <section>
          {docs.length > 0 && (
            <h2 className="text-xs font-medium text-notion-muted uppercase tracking-widest mb-3">Recent</h2>
          )}
          {loading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-notion-surface border border-notion-border rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && docs.length > 0 && (
            <p className="text-sm text-notion-muted py-8 text-center">No documents match "{search}"</p>
          )}
          {!loading && docs.length === 0 && (
            <div className="text-center py-16 border border-dashed border-notion-border rounded-2xl">
              <FileText size={32} className="text-notion-border mx-auto mb-3" />
              <p className="text-sm text-notion-muted mb-1">No documents yet</p>
              <p className="text-xs text-notion-border">Create your first document above</p>
            </div>
          )}
          <div className="space-y-1.5">
            {filtered.map(doc => (
              <div
                key={doc.id}
                onClick={() => navigate(`/doc/${doc.edit_token}`)}
                className="group flex items-center gap-4 px-4 py-3 bg-notion-surface border border-notion-border rounded-xl hover:border-notion-accent hover:bg-notion-hover transition-all cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-notion-hover border border-notion-border flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-notion-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-notion-text truncate">{doc.title || 'Untitled'}</p>
                  <p className="text-xs text-notion-muted flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {formatDistanceToNow(new Date(doc.updated_at * 1000), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => remove(e, doc.id)}
                    className="p-1.5 rounded hover:bg-notion-surface text-notion-border hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                  <ChevronRight size={14} className="text-notion-border" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
