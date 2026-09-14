import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import { useRealtime } from '../context/RealtimeContext'

export interface ConversationSummary {
  id: string
  phoneNumber: string
  contactName: string | null
  userId: string
  status: string
  mode: string
  unreadCountAgent: number
  assignedAgentId: string | null
  assignedAgentName: string | null
  handoffAt: string | null
  lastUserMessageAt: string | null
  lastAgentMessageAt: string | null
  csWindowOpen: boolean
  csWindowExpiresAt: string | null
  labels: string[]
  pinned: boolean
  archivedAt: string | null
  updatedAt: string
  createdAt: string
  lastMessagePreview?: string
}

interface InboxResponse {
  conversations: ConversationSummary[]
  total: number
  limit: number
  offset: number
}

export type AgentInboxFilter = 'own' | 'bot'
export type InboxListFilter = 'all' | 'unread' | 'unanswered'

interface UseInboxOptions {
  isAdmin?: boolean
  agentFilter?: AgentInboxFilter
  listFilter?: InboxListFilter
  searchQuery?: string
  label?: string
  includeArchived?: boolean
  activeConversationId?: string | undefined
}

const FALLBACK_POLL_MS = 5_000
const CONNECTED_INBOX_POLL_MS = 15_000

export function useInbox(options: UseInboxOptions = {}) {
  const {
    isAdmin = false,
    agentFilter = 'own',
    listFilter = 'all',
    searchQuery = '',
    label = '',
    includeArchived = false,
    activeConversationId,
  } = options
  const { connectionState, subscribe } = useRealtime()
  const wsConnected = connectionState === 'connected'

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetch = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true)
      try {
        const params = new URLSearchParams()

        if (isAdmin) {
          params.set('limit', '100')
        } else if (agentFilter === 'bot') {
          // filter=bot — prod actual; inboxFilter=bot — API nueva (M4+)
          params.set('filter', 'bot')
          params.set('inboxFilter', 'bot')
          params.set('limit', '100')
        }

        if (listFilter !== 'all') {
          params.set('filter', listFilter)
        }

        if (searchQuery.trim()) {
          params.set('q', searchQuery.trim())
        }

        if (label.trim()) {
          params.set('label', label.trim())
        }

        if (includeArchived) {
          params.set('includeArchived', 'true')
        }

        const qs = params.toString()
        const data = await api.get<InboxResponse>(`/api/v1/inbox${qs ? `?${qs}` : ''}`)
        setConversations(data.conversations)
        setTotal(data.total)
        setError('')
      } catch (err) {
        if (initial) setError(err instanceof Error ? err.message : 'Error al cargar chats')
      } finally {
        if (initial) setLoading(false)
      }
    },
    [isAdmin, agentFilter, listFilter, searchQuery, label, includeArchived],
  )

  useEffect(() => {
    void fetch(true)
  }, [fetch])

  useEffect(() => {
    if (wsConnected) {
      const id = setInterval(() => void fetch(false), CONNECTED_INBOX_POLL_MS)
      return () => clearInterval(id)
    }
    const id = setInterval(() => void fetch(false), FALLBACK_POLL_MS)
    return () => clearInterval(id)
  }, [fetch, wsConnected])

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === 'conversation.read') {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === event.conversationId
              ? { ...c, unreadCountAgent: event.unreadCountAgent }
              : c,
          ),
        )
        return
      }

      if (event.type === 'message.new') {
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === event.conversationId)
          if (idx < 0) {
            void fetch(false)
            return prev
          }

          const conv = prev[idx]!
          const isActive = event.conversationId === activeConversationId
          const isUserMsg = event.message.role === 'user'
          const preview =
            event.message.content.length > 40
              ? `${event.message.content.slice(0, 40)}…`
              : event.message.content
          const updated: ConversationSummary = {
            ...conv,
            updatedAt: event.message.timestamp,
            lastMessagePreview: preview,
            ...(isUserMsg && {
              lastUserMessageAt: event.message.timestamp,
              csWindowOpen: true,
              csWindowExpiresAt: new Date(
                new Date(event.message.timestamp).getTime() + 24 * 60 * 60 * 1000,
              ).toISOString(),
            }),
            ...(!isUserMsg && { lastAgentMessageAt: event.message.timestamp }),
            unreadCountAgent:
              isUserMsg && !isActive
                ? conv.unreadCountAgent + 1
                : conv.unreadCountAgent,
          }

          const rest = prev.filter((_, i) => i !== idx)
          return [updated, ...rest]
        })
      }
    })
  }, [subscribe, activeConversationId, fetch])

  return { conversations, total, loading, error, reload: () => void fetch(false) }
}

/** Debounce a value by the given delay in ms. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delayMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, delayMs])

  return debounced
}
