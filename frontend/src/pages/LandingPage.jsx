import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Menu, X, Sparkles, Users, History, Wand2, ShieldCheck, FileText,
} from 'lucide-react'
import { getAuthToken } from '../lib/api'

const FEATURES = [
  {
    icon: Users,
    title: 'Live Collaboration',
    text: 'Write together with presence, cursor labels, shared editing, and team chat in the same workspace.',
  },
  {
    icon: Wand2,
    title: 'AI Writing Layer',
    text: 'Refine selected text, summarize passages, and continue writing with an inline ghost preview.',
  },
  {
    icon: History,
    title: 'Version Memory',
    text: 'Track revisions, restore snapshots, and keep the document history available while the team works.',
  },
  {
    icon: ShieldCheck,
    title: 'Auth + Sync',
    text: 'JWT-based auth with Supabase-backed user and document mirroring ready for account-linked collaboration.',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const signedIn = !!getAuthToken()

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg-primary text-text-primary">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-36 -top-10 h-72 w-[36rem] rounded-full bg-gradient-to-br from-blue-500/30 via-cyan-400/18 to-transparent blur-3xl" />
        <div className="absolute left-[-10%] top-[28%] h-80 w-[28rem] rounded-full bg-gradient-to-br from-fuchsia-500/14 via-violet-500/10 to-transparent blur-3xl" />
        <div className="absolute bottom-[-12%] right-[14%] h-96 w-[40rem] rounded-full bg-gradient-to-br from-sky-400/12 via-blue-500/10 to-transparent blur-3xl" />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
      </div>

      <div className="relative z-10">
        <nav className="mx-auto mt-6 flex max-w-7xl items-center justify-between px-4 py-4">
          <button className="flex items-center gap-3" onClick={() => navigate('/')}>
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/15 bg-white/[0.04] shadow-[0_18px_40px_rgba(59,130,246,0.12)]">
              <FileText size={22} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-text-muted">LiveDraft</p>
              <p className="text-2xl font-semibold text-white">Writing studio</p>
            </div>
          </button>

          <div className="hidden items-center gap-6 md:flex">
            <button className="text-sm text-text-secondary hover:text-white">Features</button>
            <button className="text-sm text-text-secondary hover:text-white">Collaboration</button>
            <button className="text-sm text-text-secondary hover:text-white">AI Workspace</button>
            <button
              onClick={() => navigate(signedIn ? '/app' : '/auth')}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
            >
              {signedIn ? 'Open Dashboard' : 'Sign In'}
            </button>
          </div>

          <button className="md:hidden" onClick={() => setMobileMenuOpen((value) => !value)}>
            {mobileMenuOpen ? <X className="h-6 w-6 text-white" /> : <Menu className="h-6 w-6 text-white" />}
          </button>
        </nav>

        {mobileMenuOpen ? (
          <div className="mx-4 rounded-3xl border border-white/[0.06] bg-bg-secondary/95 p-4 shadow-2xl shadow-black/30 md:hidden">
            <div className="flex flex-col gap-4 text-sm text-text-secondary">
              <button className="text-left hover:text-white">Features</button>
              <button className="text-left hover:text-white">Collaboration</button>
              <button className="text-left hover:text-white">AI Workspace</button>
              <button
                onClick={() => navigate(signedIn ? '/app' : '/auth')}
                className="rounded-2xl bg-white px-4 py-3 font-medium text-black"
              >
                {signedIn ? 'Open Dashboard' : 'Continue'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mx-auto mt-8 flex max-w-fit items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 backdrop-blur-md">
          <Sparkles size={14} className="text-accent-color" />
          <span className="text-sm font-medium text-white">Real-time writing for teams with AI built in</span>
          <ArrowRight size={14} className="text-white" />
        </div>

        <section className="mx-auto max-w-7xl px-4 pb-20 pt-12">
          <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h1 className="max-w-5xl text-5xl font-semibold leading-[1.02] text-white sm:text-6xl lg:text-7xl">
                Shape shared documents with
                <span className="block bg-gradient-to-r from-white via-sky-300 to-blue-500 bg-clip-text text-transparent">
                  live cursors, AI edits, and version memory.
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-text-secondary">
                LiveDraft gives your team one writing surface for drafting, refining, discussing, and restoring work without leaving the document.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <button
                  onClick={() => navigate(signedIn ? '/app' : '/auth')}
                  className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black transition-colors hover:bg-white/90"
                >
                  {signedIn ? 'Go To Dashboard' : 'Start Writing'}
                </button>
                <button
                  onClick={() => navigate('/auth')}
                  className="rounded-full border border-white/[0.12] bg-white/[0.02] px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/[0.06]"
                >
                  Sign In / Sign Up
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[40px] bg-gradient-to-br from-white/10 via-transparent to-blue-500/10 blur-2xl" />
              <div className="relative overflow-hidden rounded-[40px] border border-white/[0.08] bg-bg-secondary/75 p-5 shadow-[0_40px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <div className="rounded-[30px] border border-white/[0.06] bg-bg-primary/80 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-text-muted">Document session</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">Launch narrative review</h2>
                    </div>
                    <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                      3 collaborators live
                    </div>
                  </div>
                  <div className="mt-8 grid gap-4">
                    <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
                      <p className="text-sm uppercase tracking-[0.24em] text-text-muted">AI Continue Writing</p>
                      <p className="mt-3 text-lg leading-8 text-white">The draft moves from strategy into execution while the ghost suggestion keeps the tone steady and the next sentence in view.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
                        <p className="text-sm font-medium text-white">Shared cursors</p>
                        <p className="mt-2 text-sm leading-7 text-text-secondary">See who is inside the page, where they are, and what part of the draft they’re shaping.</p>
                      </div>
                      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
                        <p className="text-sm font-medium text-white">Version history</p>
                        <p className="mt-2 text-sm leading-7 text-text-secondary">Restore snapshots while preserving the collaborative workflow and discussion around the document.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="mt-20">
            <div className="mb-8 flex items-end justify-between gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-text-muted">Feature Layer</p>
                <h2 className="mt-3 text-3xl font-semibold text-white">Built for collaborative drafting, not just storage.</h2>
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="group rounded-[28px] border border-white/[0.06] bg-bg-secondary/70 p-6 shadow-lg shadow-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-accent-color/40 hover:bg-bg-secondary">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-color/20 bg-accent-soft text-accent-color">
                    <feature.icon size={22} />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-text-secondary">{feature.text}</p>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </div>
  )
}
