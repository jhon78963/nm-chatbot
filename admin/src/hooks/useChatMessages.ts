import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import { useRealtime } from '../context/RealtimeContext'
import type { MessageEventData } from '../types/realtime'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'agent' | 'system' | 'internal'
  content: string
  contentType?: string
  mediaUrl?: string
  mimeType?: string
  fileName?: string
  caption?: string
  status: string
  timestamp: string
  externalId?: string
  deliveredAt?: string
  readAt?: string
  metadata?: Record<string, unknown>
}

interface ConversationMeta {
  conversationId: string
  phoneNumber: string
  contactName: string | null
  userId: string
  mode: string
  status: string
  assignedAgentId: string | null
  assignedAgentName: string | null
  unreadCountAgent: number
  csWindowOpen: boolean
  csWindowExpiresAt: string | null
  labels: string[]
  pinned: boolean
  archivedAt: string | null
}

interface HistoryResponse extends ConversationMeta {
  messages: ChatMessage[]
}

const FALLBACK_POLL_MS = 5_000

function toChatMessage(data: MessageEventData): ChatMessage {
  return {
    id: data.id,
    role: data.role,
    content: data.content,
    status: data.status,
    timestamp: data.timestamp,
    ...(data.contentType !== undefined && { contentType: data.contentType }),
    ...(data.mediaUrl !== undefined && { mediaUrl: data.mediaUrl }),
    ...(data.mimeType !== undefined && { mimeType: data.mimeType }),
    ...(data.fileName !== undefined && { fileName: data.fileName }),
    ...(data.caption !== undefined && { caption: data.caption }),
    ...(data.externalId !== undefined && { externalId: data.externalId }),
    ...(data.deliveredAt !== undefined && { deliveredAt: data.deliveredAt }),
    ...(data.readAt !== undefined && { readAt: data.readAt }),
    ...(data.metadata !== undefined && { metadata: data.metadata }),
  }
}

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const withoutOptimistic = existing.filter(
    (m) =>
      !(
        m.id.startsWith('optimistic-') &&
        m.content === incoming.content &&
        m.role === incoming.role
      ),
  )
  const idx = withoutOptimistic.findIndex((m) => m.id === incoming.id)
  if (idx >= 0) {
    const next = [...withoutOptimistic]
    next[idx] = { ...next[idx], ...incoming }
    return next
  }
  return [...withoutOptimistic, incoming]
}

export function useChatMessages(conversationId: string) {
  const { connectionState, subscribe } = useRealtime()
  const wsConnected = connectionState === 'connected'
  const lastSyncRef = useRef<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [meta, setMeta] = useState<ConversationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)

  const fetch = useCallback(
    async (initial = false, delta = false) => {
      if (!conversationId) return
      if (initial) setLoading(true)
      try {
        const since = delta && lastSyncRef.current ? lastSyncRef.current : null
        const path = since
          ? `/api/v1/conversations/${conversationId}/messages?since=${encodeURIComponent(since)}`
          : `/api/v1/conversations/${conversationId}/messages`

        const data = await api.get<HistoryResponse>(path)

        if (delta && since) {
          if (data.messages.length > 0) {
            setMessages((prev) => {
              let next = prev
              for (const msg of data.messages) {
                next = mergeMessages(next, msg)
              }
              return next
            })
          }
        } else {
          setMessages(data.messages)
        }

        if (!delta || !since) {
          const histData = data as typeof data & {
            csWindowOpen?: boolean
            csWindowExpiresAt?: string | null
            labels?: string[]
            pinned?: boolean
            archivedAt?: string | null
          }
          setMeta({
            conversationId: data.conversationId,
            phoneNumber: data.phoneNumber,
            contactName: data.contactName ?? null,
            userId: data.userId,
            mode: data.mode,
            status: data.status,
            assignedAgentId: data.assignedAgentId,
            assignedAgentName: data.assignedAgentName ?? null,
            unreadCountAgent: data.unreadCountAgent,
            csWindowOpen: histData.csWindowOpen ?? true,
            csWindowExpiresAt: histData.csWindowExpiresAt ?? null,
            labels: histData.labels ?? [],
            pinned: histData.pinned ?? false,
            archivedAt: histData.archivedAt ?? null,
          })
        }

        const latest = data.messages.length > 0
          ? data.messages[data.messages.length - 1]!.timestamp
          : null
        if (latest) lastSyncRef.current = latest
        else if (!delta && data.messages.length === 0) {
          lastSyncRef.current = new Date().toISOString()
        }

        setError('')
        setForbidden(false)
      } catch (err) {
        const e = err as Error & { status?: number }
        if (e.status === 403) {
          setForbidden(true)
        } else if (initial) {
          setError(e.message ?? 'Error al cargar mensajes')
        }
      } finally {
        if (initial) setLoading(false)
      }
    },
    [conversationId],
  )

  useEffect(() => {
    lastSyncRef.current = null
    void fetch(true, false)
  }, [fetch])

  useEffect(() => {
    if (wsConnected) return
    const id = setInterval(() => void fetch(false, true), FALLBACK_POLL_MS)
    return () => clearInterval(id)
  }, [fetch, wsConnected])

  useEffect(() => {
    return subscribe((event) => {
      if (event.conversationId !== conversationId) return

      if (event.type === 'message.new') {
        const msg = toChatMessage(event.message)
        setMessages((prev) => mergeMessages(prev, msg))
        lastSyncRef.current = msg.timestamp
      }

      if (event.type === 'message.status') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId
              ? {
                  ...m,
                  status: event.status,
                  ...(event.deliveredAt !== undefined && { deliveredAt: event.deliveredAt }),
                  ...(event.readAt !== undefined && { readAt: event.readAt }),
                }
              : m,
          ),
        )
      }

      if (event.type === 'conversation.read') {
        setMeta((prev) =>
          prev ? { ...prev, unreadCountAgent: event.unreadCountAgent } : prev,
        )
      }
    })
  }, [conversationId, subscribe])

  const addOptimisticMessage = useCallback(
    (content: string, agentId: string): string => {
      const id = `optimistic-${Date.now()}`
      const msg: ChatMessage = {
        id,
        role: 'agent',
        content,
        status: 'processing',
        timestamp: new Date().toISOString(),
        metadata: { agentId, optimistic: true },
      }
      setMessages((prev) => [...prev, msg])
      return id
    },
    [],
  )

  const markOptimisticFailed = useCallback((optimisticId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === optimisticId ? { ...m, status: 'failed' } : m)),
    )
  }, [])

  const removeOptimisticMessage = useCallback((optimisticId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
  }, [])

  return {
    messages,
    meta,
    setMeta,
    loading,
    error,
    forbidden,
    reload: () => void fetch(false, false),
    addOptimisticMessage,
    markOptimisticFailed,
    removeOptimisticMessage,
  }
}
