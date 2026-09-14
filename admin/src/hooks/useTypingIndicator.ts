import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useRealtime } from '../context/RealtimeContext'

const DEBOUNCE_MS = 300
const IDLE_MS = 3000

/**
 * Emits typing.start/stop over WebSocket while the agent composes a message.
 * Meta Cloud API does not expose inbound lead typing via standard webhooks.
 */
export function useTypingEmitter(conversationId: string, text: string, enabled: boolean) {
  const { send, connectionState } = useRealtime()
  const typingRef = useRef(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopTyping = () => {
    if (!typingRef.current) return
    typingRef.current = false
    if (connectionState === 'connected') {
      send({ type: 'typing.stop', conversationId })
    }
  }

  useEffect(() => {
    if (!enabled || connectionState !== 'connected') {
      stopTyping()
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)

    if (!text.trim()) {
      stopTyping()
      return
    }

    debounceRef.current = setTimeout(() => {
      if (!typingRef.current) {
        typingRef.current = true
        send({ type: 'typing.start', conversationId })
      }
      idleTimerRef.current = setTimeout(stopTyping, IDLE_MS)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [text, conversationId, enabled, connectionState, send])

  useEffect(() => {
    return () => {
      stopTyping()
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])
}

export function useTypingIndicator(conversationId: string) {
  const { subscribe } = useRealtime()
  const { agent } = useAuth()
  const [typingAgent, setTypingAgent] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return subscribe((event) => {
      if (event.conversationId !== conversationId) return

      if (event.type === 'typing.start' && event.agentId !== agent?.id) {
        setTypingAgent(event.agentName)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setTypingAgent(null), IDLE_MS + 500)
      }

      if (event.type === 'typing.stop' && event.agentId !== agent?.id) {
        setTypingAgent(null)
      }
    })
  }, [conversationId, subscribe, agent?.id])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [conversationId])

  return typingAgent
}
