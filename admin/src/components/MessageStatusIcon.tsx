interface Props {
  status: string
}

const CHECK_SENT = '#8696a0'
const CHECK_READ = '#53bdeb'

function SingleCheck({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 15" width="16" height="15" aria-hidden="true">
      <path
        d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.512z"
        fill={color}
      />
    </svg>
  )
}

function DoubleCheck({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 15" width="16" height="15" aria-hidden="true">
      <path
        d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.512z"
        fill={color}
      />
      <path
        d="M10.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L3.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.175a.366.366 0 0 0-.063-.512z"
        fill={color}
      />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="#8696a0" strokeWidth="1.2" />
      <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="#8696a0" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export default function MessageStatusIcon({ status }: Props) {
  if (status === 'read') {
    return (
      <span className="msg-status msg-status--read" title="Leído">
        <DoubleCheck color={CHECK_READ} />
      </span>
    )
  }
  if (status === 'delivered') {
    return (
      <span className="msg-status msg-status--delivered" title="Entregado">
        <DoubleCheck color={CHECK_SENT} />
      </span>
    )
  }
  if (status === 'sent') {
    return (
      <span className="msg-status msg-status--sent" title="Enviado">
        <SingleCheck color={CHECK_SENT} />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="msg-status msg-status--failed" title="Error al enviar">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="#ef4444" />
          <path d="M8 4.5v4M8 11h.01" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  if (status === 'processing') {
    return (
      <span className="msg-status msg-status--processing" title="Enviando…">
        <ClockIcon />
      </span>
    )
  }
  return null
}
