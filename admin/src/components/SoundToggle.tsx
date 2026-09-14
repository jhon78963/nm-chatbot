import { useState } from 'react'
import { isSoundMuted, setSoundMuted } from '../utils/notificationSound'

export default function SoundToggle() {
  const [muted, setMuted] = useState(isSoundMuted)

  function toggle() {
    const next = !muted
    setMuted(next)
    setSoundMuted(next)
  }

  return (
    <button
      type="button"
      className="dash-sound-btn"
      onClick={toggle}
      title={muted ? 'Activar sonido' : 'Silenciar notificaciones'}
      aria-label={muted ? 'Activar sonido' : 'Silenciar notificaciones'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
