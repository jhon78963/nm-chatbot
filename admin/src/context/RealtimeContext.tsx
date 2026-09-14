import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getWebSocketUrl } from '../api/client'
import type {
  ConnectionState,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeClientEvent,
} from '../types/realtime'

interface RealtimeContextValue {
  connectionState: ConnectionState
  lastSyncAt: Date | null
  reconnect: () => void
  subscribe: (handler: RealtimeEventHandler) => () => void
  send: (event: RealtimeClientEvent) => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

const MAX_BACKOFF_MS = 30_000
const CLIENT_PING_MS = 25_000

function parseEvent(data: string): RealtimeEvent | null {
  try {
    const parsed = JSON.parse(data) as { type?: string }
    if (parsed.type === 'ping' || parsed.type === 'pong' || parsed.type === 'connected') {
      return null
    }
    if (
      parsed.type === 'message.new' ||
      parsed.type === 'message.status' ||
      parsed.type === 'conversation.read' ||
      parsed.type === 'typing.start' ||
      parsed.type === 'typing.stop'
    ) {
      return parsed as RealtimeEvent
    }
  } catch {
    /* ignore malformed frames */
  }
  return null
}

export function RealtimeProvider({
  token,
  children,
}: {
  token: string
  children: ReactNode
}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef(new Set<RealtimeEventHandler>())
  const backoffRef = useRef(1000)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const intentionalCloseRef = useRef(false)
  const connectRef = useRef<() => void>(() => {})

  const emit = useCallback((event: RealtimeEvent) => {
    for (const handler of handlersRef.current) {
      handler(event)
    }
  }, [])

  const subscribe = useCallback((handler: RealtimeEventHandler) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current) return
    setConnectionState('reconnecting')
    const delay = backoffRef.current
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
    reconnectTimerRef.current = setTimeout(() => {
      connectRef.current()
    }, delay)
  }, [])

  const connect = useCallback(() => {
    clearTimers()
    if (wsRef.current) {
      intentionalCloseRef.current = true
      wsRef.current.close()
      wsRef.current = null
    }
    intentionalCloseRef.current = false

    setConnectionState((prev) => (prev === 'connected' ? 'reconnecting' : 'connecting'))

    const ws = new WebSocket(getWebSocketUrl(token))
    wsRef.current = ws

    ws.onopen = () => {
      backoffRef.current = 1000
      setConnectionState('connected')
      setLastSyncAt(new Date())
    }

    ws.onmessage = (ev) => {
      setLastSyncAt(new Date())
      const raw = String(ev.data)
      try {
        const control = JSON.parse(raw) as { type?: string }
        if (control.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
          return
        }
      } catch {
        /* fall through to business events */
      }
      const parsed = parseEvent(raw)
      if (parsed) emit(parsed)
    }

    ws.onclose = () => {
      clearTimers()
      wsRef.current = null
      if (intentionalCloseRef.current) {
        setConnectionState('disconnected')
        return
      }
      scheduleReconnect()
    }

    ws.onerror = () => {
      /* onclose handles reconnect */
    }

    pingTimerRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, CLIENT_PING_MS)
  }, [token, clearTimers, emit, scheduleReconnect])

  connectRef.current = connect

  const reconnect = useCallback(() => {
    backoffRef.current = 1000
    connect()
  }, [connect])

  const send = useCallback((event: RealtimeClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      intentionalCloseRef.current = true
      clearTimers()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect, clearTimers])

  return (
    <RealtimeContext.Provider
      value={{ connectionState, lastSyncAt, reconnect, subscribe, send }}
    >
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider')
  return ctx
}
