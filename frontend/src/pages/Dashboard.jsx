import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Trash2, Clock, ChevronRight, Search, Users } from 'lucide-react'
import { listDocs, createDoc, deleteDoc } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'

const TEMPLATES = [
  { 
    id: 'blank', 
    name: 'Blank page', 
    icon: '📄', 
    content: '',
    prompts: {
      summarize: (text) => `Please summarize the following text concisely:\n\n${text}`,
      explain: (text) => `Please explain the following text in simple terms:\n\n${text}`,
      improve: (text) => `Please improve the writing quality of the following text while preserving the original meaning:\n\n${text}`,
      continue: (text) => `Continue the following text naturally. Provide only the next 2-3 sentences. No chat preamble:\n\n${text}`,
      translate: (text) => `Please translate the following text to Spanish:\n\n${text}`,
      bullets: (text) => `Please convert the following text into clear bullet points:\n\n${text}`,
    }
  },
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
    <div className="min-h-screen bg-bg-primary text-text-primary font-main">
      {/* Top nav */}
      <header className="border-b border-white/[0.05] bg-bg-secondary/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-accent-soft border border-accent-color/20 rounded-xl flex items-center justify-center shadow-lg shadow-accent-color/5">
              <Plus size={20} className="text-accent-color" />
            </div>
            <span className="font-bold text-xl font-display tracking-tight text-white">Collab</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-white/[0.03] border border-white/[0.05] rounded-full text-[11px] font-bold text-text-muted uppercase tracking-widest">
            <Users size={14} className="text-accent-color" />
            <span>{docs.length} Workspace Items</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-16">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="text-5xl font-bold font-display text-white mb-4 tracking-tight leading-tight">
            Design your <span className="text-accent-color">shared reality.</span>
          </h1>
          <p className="text-text-secondary text-lg max-w-2xl leading-relaxed">
            A premium, real-time workspace for high-performance teams. Create, collaborate, and automate with AI.
          </p>
        </div>

        {/* Templates */}
        <section className="mb-16">
          <h2 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.2em] mb-6">Quick Start</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => newDoc(tpl)}
                disabled={creating}
                className="group flex flex-col items-start gap-4 p-6 bg-bg-secondary border border-white/[0.05] rounded-2xl hover:border-accent-color hover:bg-bg-tertiary transition-all duration-300 text-left disabled:opacity-50 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-accent-color/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="text-3xl relative z-10">{tpl.icon}</span>
                <span className="text-sm font-semibold text-text-secondary group-hover:text-white transition-colors relative z-10">
                  {tpl.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Search & Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-12">
          <button
            onClick={() => newDoc()}
            disabled={creating}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3.5 bg-accent-color hover:bg-blue-600 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            <Plus size={18} />
            {creating ? 'Creating Workspace…' : 'Create New Document'}
          </button>

          {docs.length > 0 && (
            <div className="relative flex-1 group">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-color transition-colors" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search through documents..."
                className="w-full bg-bg-secondary border border-white/[0.05] rounded-xl pl-12 pr-6 py-3.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-color transition-all"
              />
            </div>
          )}
        </div>

        {/* Document list */}
        <section>
          {docs.length > 0 && (
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.2em]">Recently Edited</h2>
              <div className="text-[10px] text-text-muted font-medium bg-white/[0.02] px-2 py-1 rounded">
                ASCENDING BY DATE
              </div>
            </div>
          )}

          {loading && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-bg-secondary border border-white/[0.05] rounded-2xl animate-pulse" />
              ))}
            </div>
          )}

          {!loading && docs.length === 0 && (
            <div className="text-center py-24 border-2 border-dashed border-white/[0.05] rounded-3xl bg-white/[0.01]">
              <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileText size={32} className="text-text-muted" />
              </div>
              <p className="text-xl font-bold text-white mb-2">No workspace items found</p>
              <p className="text-text-muted max-w-sm mx-auto">
                Create your first document to start collaborating with your team in real-time.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {filtered.map(doc => (
              <div
                key={doc.id}
                onClick={() => navigate(`/doc/${doc.edit_token}`)}
                className="group flex items-center gap-5 px-6 py-4 bg-bg-secondary border border-white/[0.05] rounded-2xl hover:border-accent-color/50 hover:bg-bg-tertiary transition-all duration-300 cursor-pointer shadow-sm hover:shadow-xl hover:shadow-black/20"
              >
                <div className="w-12 h-12 rounded-xl bg-bg-tertiary border border-white/[0.05] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <FileText size={20} className="text-accent-color" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-white truncate group-hover:text-accent-color transition-colors">
                    {doc.title || 'Untitled Document'}
                  </p>
                  <div className="flex items-center gap-4 mt-1.5">
                    <p className="text-[11px] text-text-muted flex items-center gap-1.5 uppercase font-bold tracking-wider">
                      <Clock size={12} className="text-accent-color/50" />
                      {formatDistanceToNow(new Date(doc.updated_at * 1000), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <button
                    onClick={e => remove(e, doc.id)}
                    className="p-2.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                    title="Move to trash"
                  >
                    <Trash2 size={16} />
                  </button>
                  <div className="p-2.5 bg-bg-tertiary rounded-lg border border-white/[0.05]">
                    <ChevronRight size={16} className="text-text-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
