import { useState } from 'react'
import { Users, Wifi, WifiOff, Eye, Copy, Check, Link2, ChevronDown } from 'lucide-react'
import { setLocalUser, getLocalUser } from '../lib/colors'

function Avatar({ user, size = 28 }) {
  return (
    <div
      title={user.name}
      style={{ backgroundColor: user.color + '33', border: `2px solid ${user.color}`, width: size, height: size }}
      className="rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
    >
      <span style={{ color: user.color }}>
        {user.name?.charAt(0)?.toUpperCase() || '?'}
      </span>
    </div>
  )
}

export default function PresenceBar({ doc, users, connected, onUpdateUser }) {
  const [copied, setCopied] = useState(null)
  const [showShare, setShowShare] = useState(false)
  const [editName, setEditName] = useState(false)
  const [nameVal, setNameVal] = useState(getLocalUser().name)
  const localUser = getLocalUser()
  const joinedUsers = users.some((user) => user.name === localUser.name)
    ? users
    : [{ clientId: 'local', name: localUser.name, color: localUser.color }, ...users]

  const copyLink = async (type) => {
    const base = window.location.origin
    const url = type === 'edit'
      ? `${base}/doc/${doc.edit_token}`
      : `${base}/view/${doc.view_token}`
    await navigator.clipboard.writeText(url)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const saveName = () => {
    const trimmed = nameVal.trim()
    if (!trimmed) return
    setLocalUser(trimmed, localUser.color)
    onUpdateUser?.(trimmed, localUser.color)
    setEditName(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-notion-border bg-notion-surface text-sm">
      {/* Left: title + status */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5">
          {connected
            ? <Wifi size={12} className="text-green-500" />
            : <WifiOff size={12} className="text-red-400 animate-pulse" />
          }
          <span className={`text-xs font-medium ${connected ? 'text-green-500' : 'text-red-400'}`}>
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
        <div className="w-px h-4 bg-notion-border" />
        <span className="text-notion-muted text-xs truncate max-w-[200px]">
          {doc?.title || 'Untitled'}
        </span>
      </div>

      {/* Right: avatars + share */}
      <div className="flex items-center gap-3">
        {/* Online users */}
        <div className="flex items-center gap-1.5">
          <Users size={12} className="text-notion-muted" />
          <div className="flex -space-x-1.5">
            {joinedUsers.slice(0, 6).map((u) => (
              <Avatar key={u.clientId} user={u} size={24} />
            ))}
            {joinedUsers.length > 6 && (
              <div className="w-6 h-6 rounded-full bg-notion-hover border-2 border-notion-surface flex items-center justify-center text-[9px] text-notion-muted">
                +{joinedUsers.length - 6}
              </div>
            )}
          </div>
          <span className="text-xs text-notion-muted">{joinedUsers.length}</span>
        </div>

        {/* My name */}
        <div className="flex items-center gap-1.5">
          <Avatar user={{ name: localUser.name, color: localUser.color }} size={22} />
          {editName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
              className="text-xs bg-notion-hover border border-notion-border rounded px-2 py-0.5 text-notion-text w-28 outline-none"
            />
          ) : (
            <button
              onClick={() => setEditName(true)}
              className="text-xs text-notion-silver hover:text-notion-text transition-colors"
            >
              {localUser.name}
            </button>
          )}
        </div>

        {/* Share menu */}
        {doc && (
          <div className="relative">
            <button
              onClick={() => setShowShare(s => !s)}
              className="flex items-center gap-1.5 text-xs bg-notion-hover border border-notion-border text-notion-silver hover:text-notion-text hover:border-notion-accent px-3 py-1.5 rounded-md transition-all"
            >
              <Link2 size={12} />
              Share
              <ChevronDown size={10} className={`transition-transform ${showShare ? 'rotate-180' : ''}`} />
            </button>
            {showShare && (
              <div className="absolute right-0 top-full mt-1 bg-notion-surface border border-notion-border rounded-lg p-3 min-w-[260px] z-50 shadow-2xl animate-slide-up">
                <p className="text-[11px] text-notion-muted mb-2 font-medium uppercase tracking-wider">Share document</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-notion-bg border border-notion-border rounded-md p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-notion-muted">Edit link</p>
                      <p className="text-xs text-notion-silver truncate font-mono">/doc/{doc.edit_token?.slice(0,8)}…</p>
                    </div>
                    <button
                      onClick={() => copyLink('edit')}
                      className="flex items-center gap-1 text-xs text-notion-silver hover:text-notion-text px-2 py-1 rounded hover:bg-notion-hover transition-all"
                    >
                      {copied === 'edit' ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                      Copy
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-notion-bg border border-notion-border rounded-md p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-notion-muted flex items-center gap-1"><Eye size={10} /> View only</p>
                      <p className="text-xs text-notion-silver truncate font-mono">/view/{doc.view_token?.slice(0,8)}…</p>
                    </div>
                    <button
                      onClick={() => copyLink('view')}
                      className="flex items-center gap-1 text-xs text-notion-silver hover:text-notion-text px-2 py-1 rounded hover:bg-notion-hover transition-all"
                    >
                      {copied === 'view' ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
