import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ClipboardList,
  Clock,
  Cpu,
  FileText,
  Lightbulb,
  PenSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { listDocs, createDoc, deleteDoc, signOut } from '../lib/api'
import { formatDistanceToNow } from 'date-fns'
import InlineNotice from '../components/InlineNotice'

const TEMPLATES = [
  { id: 'blank', name: 'Blank page', icon: PenSquare, content: '' },
  { id: 'meeting', name: 'Meeting notes', icon: ClipboardList, content: '# Meeting Notes\n\n## Agenda\n\n## Discussion\n\n## Action Items\n\n' },
  { id: 'doc', name: 'Technical doc', icon: Cpu, content: '# Technical Documentation\n\n## Overview\n\n## Setup\n\n## Usage\n\n## Reference\n\n' },
  { id: 'brainstorm', name: 'Brainstorm', icon: Lightbulb, content: '# Brainstorm Session\n\n## Problem Statement\n\n## Ideas\n\n- \n- \n- \n\n## Next Steps\n\n' },
]

const DASHBOARD_FEATURES = [
  'Shared editing with live presence',
  'AI drafting and refinement in the document',
  'Revision restore with persistent history',
]

export default function DashboardModern() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const refreshDocs = useCallback(() => {
    setLoading(true)
    setError('')
    listDocs()
      .then(setDocs)
      .catch((err) => {
        setDocs([])
        setError(err.message || 'Unable to load your documents right now.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshDocs()

    const handleDocsUpdated = () => refreshDocs()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshDocs()
    }

    window.addEventListener('docs-updated', handleDocsUpdated)
    window.addEventListener('focus', refreshDocs)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('docs-updated', handleDocsUpdated)
      window.removeEventListener('focus', refreshDocs)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refreshDocs])

  const newDoc = async (template = TEMPLATES[0]) => {
    setCreating(true)
    setError('')
    try {
      const doc = await createDoc(template.name === 'Blank page' ? 'untitled' : template.name)
      const now = Math.floor(Date.now() / 1000)
      setDocs((current) => [{ ...doc, created_at: now, updated_at: now }, ...current])
      navigate(`/doc/${doc.edit_token}`, { state: { template } })
    } catch (err) {
      setError(err.message || 'Unable to create a new document.')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (event, id) => {
    event.stopPropagation()
    if (!window.confirm('Delete this document permanently?')) return
    setError('')
    try {
      await deleteDoc(id)
      setDocs((current) => current.filter((doc) => doc.id !== id))
    } catch (err) {
      setError(err.message || 'Unable to delete that document.')
    }
  }

  const filtered = docs.filter((doc) =>
    doc.title?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg-primary text-text-primary font-main">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-36 -top-10 h-72 w-[36rem] rounded-full bg-gradient-to-br from-blue-500/28 via-cyan-400/16 to-transparent blur-3xl" />
        <div className="absolute left-[-12%] top-[24%] h-80 w-[28rem] rounded-full bg-gradient-to-br from-fuchsia-500/14 via-violet-500/10 to-transparent blur-3xl" />
        <div className="absolute bottom-[-12%] right-[10%] h-96 w-[40rem] rounded-full bg-gradient-to-br from-sky-400/12 via-blue-500/10 to-transparent blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}
        />
      </div>

      <header className="relative z-20 border-b border-white/[0.06] bg-bg-secondary/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/15 bg-white/[0.04] shadow-[0_18px_40px_rgba(59,130,246,0.12)]">
              <FileText size={22} className="text-white" />
            </div>
              <div>
                <p className="text-[1.75rem] font-semibold tracking-[-0.03em] text-white">LiveDraft</p>
              </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted sm:flex">
              <Users size={14} className="text-accent-color" />
              <span>{docs.length} Active Drafts</span>
            </div>
            <button
              type="button"
              onClick={() => {
                signOut()
                navigate('/')
              }}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-10">
        <InlineNotice message={error} tone="error" className="mb-6" />
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[36px] border border-white/[0.08] bg-bg-secondary/60 p-8 shadow-[0_40px_120px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-10">
            <div className="flex max-w-fit items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2">
              <Sparkles size={14} className="text-accent-color" />
              <span className="text-sm font-medium text-white">Your collaborative writing base</span>
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.02] text-white sm:text-5xl lg:text-6xl">
              Keep drafts moving with
              <span className="block bg-gradient-to-r from-white via-sky-300 to-blue-500 bg-clip-text text-transparent">
                LiveDraft workspaces built for teams.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-text-secondary">
              Create a new document, bring your team in, and keep AI, chat, version history, and live presence in one focused writing surface.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button
                onClick={() => newDoc()}
                disabled={creating}
                className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-60"
              >
                <Plus size={18} />
                {creating ? 'Creating workspace...' : 'Create New Document'}
              </button>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {DASHBOARD_FEATURES.map((feature) => (
                <div key={feature} className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
                  <p className="text-sm leading-7 text-text-secondary">{feature}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[36px] border border-white/[0.08] bg-bg-secondary/60 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-text-muted">Workspace pulse</p>
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
                <p className="text-sm text-text-secondary">Documents</p>
                <p className="mt-2 text-4xl font-semibold text-white">{docs.length}</p>
              </div>
              <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
                <p className="text-sm text-text-secondary">Ready templates</p>
                <p className="mt-2 text-4xl font-semibold text-white">{TEMPLATES.length}</p>
              </div>
              <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
                <p className="text-sm text-text-secondary">AI-enabled workflow</p>
                <p className="mt-2 text-base leading-7 text-white">Refine, summarize, and continue writing directly from the editor without leaving the page.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[36px] border border-white/[0.08] bg-bg-secondary/60 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-text-muted">Quick Start</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Launch from a writing pattern</h2>
              </div>
              <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-text-secondary">
                {TEMPLATES.length} templates
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {TEMPLATES.map((template) => {
                const Icon = template.icon
                return (
                  <button
                    key={template.id}
                    onClick={() => newDoc(template)}
                    disabled={creating}
                    className="group rounded-[28px] border border-white/[0.06] bg-white/[0.03] p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-accent-color/40 hover:bg-bg-secondary disabled:opacity-60"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-color/20 bg-accent-soft text-accent-color">
                      <Icon size={22} />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white">{template.name}</h3>
                    <p className="mt-2 text-sm leading-7 text-text-secondary">
                      Start with a structured canvas that fits this writing mode and move straight into collaboration.
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-[36px] border border-white/[0.08] bg-bg-secondary/60 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-text-muted">Document Library</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Recent drafts and active documents</h2>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <button
                  onClick={() => newDoc()}
                  disabled={creating}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.08] disabled:opacity-60"
                >
                  <Plus size={16} />
                  {creating ? 'Creating...' : 'Create document'}
                </button>
                <div className="relative w-full sm:w-[260px]">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search documents"
                    className="w-full rounded-full border border-white/[0.08] bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-text-muted focus:border-accent-color/50"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 space-y-4">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="h-24 rounded-[28px] border border-white/[0.06] bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : null}

            {!loading && filtered.length === 0 ? (
              <div className="mt-6 rounded-[32px] border border-dashed border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
                  <FileText size={28} className="text-text-muted" />
                </div>
                <p className="mt-6 text-2xl font-semibold text-white">
                  {docs.length === 0 ? 'No documents yet' : 'No matching drafts'}
                </p>
                <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-text-secondary">
                  {docs.length === 0
                    ? 'Create your first LiveDraft document to start collaborating with your team in real time.'
                    : 'Try a different search term or launch a new document from one of the quick-start templates.'}
                </p>
              </div>
            ) : null}

            {!loading && filtered.length > 0 ? (
              <div className="mt-6 grid gap-4">
                {filtered.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => navigate(`/doc/${doc.edit_token}`)}
                    className="group flex cursor-pointer items-center gap-5 rounded-[28px] border border-white/[0.06] bg-white/[0.03] px-5 py-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent-color/40 hover:bg-bg-secondary"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/[0.06] bg-bg-primary/60 text-accent-color">
                      <FileText size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold text-white">{doc.title || 'Untitled Document'}</p>
                      <div className="mt-2 flex items-center gap-3 text-sm text-text-secondary">
                        <Clock size={14} className="text-accent-color/70" />
                        <span>{formatDistanceToNow(new Date(doc.updated_at * 1000), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <button
                        onClick={(event) => remove(event, doc.id)}
                        className="rounded-xl p-2.5 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="Delete document"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="rounded-xl border border-white/[0.06] bg-bg-primary/60 p-2.5 text-text-secondary">
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}
