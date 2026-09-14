interface Props {
  label?: string | null
}

export default function TypingIndicator({ label }: Props) {
  if (!label) return null

  return (
    <div className="typing-indicator" role="status" aria-live="polite">
      <span className="typing-indicator-label">{label} escribiendo</span>
      <span className="typing-dots" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
    </div>
  )
}
