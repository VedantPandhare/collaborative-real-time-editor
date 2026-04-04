import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { FileText, Lock, Mail } from 'lucide-react'
import { getAuthToken, signIn, signUp } from '../lib/api'

export default function AuthPage() {
  const navigate = useNavigate()
  const existingToken = getAuthToken()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const title = useMemo(() => (
    mode === 'signin' ? 'Welcome back to coolab' : 'Create your coolab account'
  ), [mode])

  if (existingToken) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.9fr]">
          <section className="rounded-[32px] border border-white/[0.06] bg-bg-secondary/60 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-12">
            <div className="mb-10 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-accent-color/20 bg-accent-soft">
                <FileText size={24} className="text-accent-color" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-text-muted">coolab</p>
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
              </div>
            </div>
            <p className="max-w-xl text-base leading-8 text-text-secondary">
              Real-time writing, version history, AI drafting, and collaborative editing in one workspace.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-text-secondary">JWT-based sign in</div>
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-text-secondary">Private document dashboard</div>
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-text-secondary">Supabase-ready sync</div>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/[0.06] bg-bg-secondary p-8 shadow-2xl shadow-black/20 sm:p-10">
            <div className="mb-8 flex gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] p-1">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-accent-soft text-accent-color' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-accent-soft text-accent-color' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-secondary">Email</span>
                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                  <Mail size={16} className="text-text-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-secondary">Password</span>
                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                  <Lock size={16} className="text-text-muted" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="Minimum 6 characters"
                    minLength={6}
                    required
                  />
                </div>
              </label>

              {error ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-accent-color px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
              >
                {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
