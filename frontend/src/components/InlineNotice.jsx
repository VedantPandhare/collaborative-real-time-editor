const toneClasses = {
  error: 'border-red-500/20 bg-red-500/10 text-red-200',
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  info: 'border-white/[0.08] bg-white/[0.04] text-text-secondary',
}

export default function InlineNotice({ message, tone = 'info', className = '' }) {
  if (!message) return null

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClasses[tone] || toneClasses.info} ${className}`.trim()}>
      {message}
    </div>
  )
}
