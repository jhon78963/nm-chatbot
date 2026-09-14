import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRealtime } from '../context/RealtimeContext'
import {
  playMessageSound,
  requestNotificationPermission,
  showMessageNotification,
} from '../utils/notificationSound'

interface Options {
  activeConversationId?: string | undefined
  readOnly?: boolean
  agentId?: string | undefined
}

export function useMessageNotifications({
  activeConversationId,
  readOnly = false,
  agentId,
}: Options) {
  const { subscribe } = useRealtime()
  const navigate = useNavigate()
  const askedRef = useRef(false)

  useEffect(() => {
    if (askedRef.current || readOnly) return
    askedRef.current = true
    void requestNotificationPermission()
  }, [readOnly])

  useEffect(() => {
    return subscribe((event) => {
      if (event.type !== 'message.new') return
      if (readOnly) return

      const isOwnAgentMessage =
        event.message.role === 'agent' &&
        event.message.metadata?.['agentId'] === agentId

      if (isOwnAgentMessage) return

      const isInbound = event.message.role === 'user'
      if (!isInbound) return

      const isActive = event.conversationId === activeConversationId
      const tabHidden = document.hidden

      if (!isActive || tabHidden) {
        playMessageSound()
      }

      if (tabHidden) {
        const preview =
          event.message.content.length > 80
            ? `${event.message.content.slice(0, 80)}…`
            : event.message.content
        showMessageNotification('Nuevo mensaje', preview, () => {
          navigate(`/chat/${event.conversationId}`)
        })
      }
    })
  }, [subscribe, activeConversationId, readOnly, agentId, navigate])
}
