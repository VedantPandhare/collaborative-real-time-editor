import { useState, useRef, useEffect } from 'react'
import { Send, X, MessageSquare, Hash } from 'lucide-react'
import { getLocalUser } from '../lib/colors'
import { formatDistanceToNow } from 'date-fns'

function ChatMessage({ msg, isOwn }) {
  const time = msg.created_at
    ? formatDistanceToNow(new Date(msg.created_at * 1000), { addSuffix: true })
    : 'just now'

  // Parse @mentions
  const renderMessage = (text) => {
    const parts = text.split(/(@\w[\w\s]*)/g)
    return parts.map((part, i) =>
      part.startsWith('@') ? (
        <span key={i} className="text-notion-silver font-medium bg-notion-hover px-1 rounded">{part}</span>
      ) : part
    )
  }

  return (
    <div className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1.5">
        <div
          style={{ backgroundColor: msg.userColor + '33', border: `1.5px solid ${msg.userColor}`, width: 16, height: 16 }}
          className="rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
        >
          <span style={{ color: msg.userColor }}>{msg.userName?.charAt(0)?.toUpperCase()}</span>
        </div>
        <span className="text-[10px] text-notion-muted">{msg.userName}</span>
        <span className="text-[9px] text-notion-border">{time}</span>
      </div>
      <div
        className={`
          max-w-[90%] text-xs leading-relaxed px-2.5 py-1.5 rounded-lg
          ${isOwn
            ? 'bg-notion-hover border border-notion-border/50 text-notion-text rounded-tr-sm'
            : 'bg-notion-surface border border-notion-border text-notion-silver rounded-tl-sm'
          }
        `}
      >
        {renderMessage(msg.message)}
      </div>
    </div>
  )
}

export default function ChatPanel({ onClose, sendChat, messages, users, onError }) {
  const [input, setInput] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const localUser = getLocalUser()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleInput = (e) => {
    const val = e.target.value
    setInput(val)
    const atMatch = val.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setShowMentions(true)
    } else {
      setShowMentions(false)
    }
  }

  const sendMessage = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    const sent = sendChat(trimmed)
    if (!sent) {
      onError?.('Message could not be sent while the editor is offline.')
      return
    }
    setInput('')
    setShowMentions(false)
  }

  const insertMention = (name) => {
    const newVal = input.replace(/@\w*$/, `@${name} `)
    setInput(newVal)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(mentionQuery.toLowerCase()) &&
    u.name !== localUser.name
  )

  return (
    <div className="flex flex-col h-full bg-notion-surface border-l border-notion-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-notion-border">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-notion-muted" />
          <span className="text-sm font-medium text-notion-text">Chat</span>
          <span className="text-xs text-notion-muted bg-notion-hover px-1.5 py-0.5 rounded">{messages.length}</span>
        </div>
        <button onClick={onClose} className="text-notion-muted hover:text-notion-text transition-colors p-1 rounded hover:bg-notion-hover">
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Hash size={20} className="text-notion-border mx-auto mb-2" />
            <p className="text-xs text-notion-muted">No messages yet</p>
            <p className="text-xs text-notion-border">Use @ to mention someone</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            msg={msg}
            isOwn={msg.userName === localUser.name}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-notion-border relative">
        {showMentions && filteredUsers.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-notion-surface border border-notion-border rounded-lg p-1 shadow-xl animate-slide-up">
            {filteredUsers.map(u => (
              <button
                key={u.clientId}
                onClick={() => insertMention(u.name)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-notion-hover text-left"
              >
                <div
                  style={{ backgroundColor: u.color + '33', border: `1.5px solid ${u.color}` }}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                >
                  <span style={{ color: u.color }}>{u.name?.charAt(0)?.toUpperCase()}</span>
                </div>
                <span className="text-xs text-notion-text">{u.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Message… (@ to mention)"
            className="flex-1 bg-notion-bg border border-notion-border rounded-lg px-3 py-2 text-xs text-notion-text placeholder-notion-border outline-none focus:border-notion-silver transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="w-8 h-8 flex items-center justify-center bg-notion-hover border border-notion-border rounded-lg text-notion-silver hover:text-notion-text hover:bg-notion-surface disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
