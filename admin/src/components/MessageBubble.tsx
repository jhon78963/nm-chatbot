import type { ChatMessage } from '../hooks/useChatMessages'
import { resolveMediaUrl } from '../api/client'
import MessageStatusIcon from './MessageStatusIcon'

interface Props {
  message: ChatMessage
}

const ROLE_LABEL: Partial<Record<ChatMessage['role'], string>> = {
  assistant: 'Malu',
  system: 'Sistema',
}

function parseCoords(m: ChatMessage): { lat: number; lng: number } | null {
  const meta = m.metadata
  if (meta) {
    const lat = Number(meta['latitude'])
    const lng = Number(meta['longitude'])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  const match = m.content.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (match) {
    return { lat: Number(match[1]), lng: Number(match[2]) }
  }
  return null
}

function LocationContent({ message: m }: { message: ChatMessage }) {
  const coords = parseCoords(m)
  const name = (m.metadata?.['locationName'] as string | undefined) ?? undefined
  const address = (m.metadata?.['locationAddress'] as string | undefined) ?? m.content
  const mapsUrl = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

  return (
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="dash-bubble-location">
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
      </svg>
      <span className="dash-bubble-location-text">
        {name && <span className="dash-bubble-location-name">{name}</span>}
        <span className="dash-bubble-location-addr">{address}</span>
        <span className="dash-bubble-location-link">Ver en Google Maps →</span>
      </span>
    </a>
  )
}

function MediaContent({ message: m }: { message: ChatMessage }) {
  const isImage = m.contentType === 'image'
  const isDoc = m.contentType === 'document'
  const isAudio = m.contentType === 'audio'
  const isVideo = m.contentType === 'video'
  const mediaSrc = m.mediaUrl ? resolveMediaUrl(m.mediaUrl) : undefined

  if (isAudio && mediaSrc) {
    return (
      <div className="dash-bubble-audio">
        <audio controls preload="none" src={mediaSrc} className="dash-bubble-audio-player">
          Tu navegador no soporta audio HTML5.
        </audio>
        {m.caption && <span className="dash-bubble-caption">{m.caption}</span>}
      </div>
    )
  }

  if (isVideo && mediaSrc) {
    return (
      <div className="dash-bubble-video">
        <video controls preload="none" src={mediaSrc} className="dash-bubble-video-player">
          Tu navegador no soporta video HTML5.
        </video>
        {m.caption && <span className="dash-bubble-caption">{m.caption}</span>}
      </div>
    )
  }

  if (isImage && mediaSrc) {
    return (
      <a href={mediaSrc} target="_blank" rel="noopener noreferrer" className="dash-bubble-media-link">
        <img
          src={mediaSrc}
          alt={m.caption ?? m.fileName ?? 'imagen'}
          className="dash-bubble-img"
          loading="lazy"
        />
        {m.caption && <span className="dash-bubble-caption">{m.caption}</span>}
      </a>
    )
  }

  if (isDoc && mediaSrc) {
    return (
      <a href={mediaSrc} target="_blank" rel="noopener noreferrer" className="dash-bubble-doc">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
        </svg>
        <span className="dash-bubble-doc-name">{m.fileName ?? m.caption ?? 'Documento'}</span>
      </a>
    )
  }

  return null
}

export default function MessageBubble({ message: m }: Props) {
  const isInternal = m.role === 'internal'
  const isOutbound = m.role === 'agent' || m.role === 'assistant'
  const isLocation = m.contentType === 'location'
  const time = new Date(m.timestamp).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const senderLabel = ROLE_LABEL[m.role]
  const hasMedia = (
    m.contentType === 'image' ||
    m.contentType === 'document' ||
    m.contentType === 'audio' ||
    m.contentType === 'video'
  ) && m.mediaUrl
  const showText = !hasMedia && !isLocation && !!m.content

  if (isInternal) {
    return (
      <div className="dash-bubble-row dash-bubble-row--note">
        <div className="dash-bubble dash-bubble--internal">
          <span className="dash-bubble-note-label">
            <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12" style={{ flexShrink: 0 }}>
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
            </svg>
            Nota interna
          </span>
          <p className="dash-bubble-text">{m.content}</p>
          <div className="dash-bubble-footer">
            <span className="dash-bubble-time dash-bubble-time--note">{time}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`dash-bubble-row${isOutbound ? ' dash-bubble-row--out' : ''}`}>
      <div className={`dash-bubble dash-bubble--${m.role}`}>
        {senderLabel && <span className="dash-bubble-sender">{senderLabel}</span>}
        {isLocation && <LocationContent message={m} />}
        {hasMedia && <MediaContent message={m} />}
        {showText && <p className="dash-bubble-text">{m.content}</p>}
        <div className="dash-bubble-footer">
          <span className="dash-bubble-time">{time}</span>
          {isOutbound && <MessageStatusIcon status={m.status} />}
        </div>
      </div>
    </div>
  )
}
