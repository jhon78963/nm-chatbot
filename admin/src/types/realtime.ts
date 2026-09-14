export type MessageRole = 'user' | 'assistant' | 'system' | 'agent' | 'internal'
export type MessageStatus = 'received' | 'processing' | 'sent' | 'delivered' | 'failed' | 'read'

export interface MessageEventData {
  id: string
  role: MessageRole
  content: string
  status: MessageStatus
  timestamp: string
  contentType?: string
  mediaUrl?: string
  mimeType?: string
  fileName?: string
  caption?: string
  externalId?: string
  deliveredAt?: string
  readAt?: string
  metadata?: Record<string, unknown>
}

export type RealtimeEvent =
  | { type: 'message.new'; conversationId: string; message: MessageEventData }
  | {
      type: 'message.status'
      conversationId: string
      messageId: string
      status: MessageStatus
      deliveredAt?: string
      readAt?: string
    }
  | { type: 'conversation.read'; conversationId: string; unreadCountAgent: number }
  | { type: 'typing.start'; conversationId: string; agentId: string; agentName: string }
  | { type: 'typing.stop'; conversationId: string; agentId: string }

export type RealtimeClientEvent =
  | { type: 'ping' }
  | { type: 'typing.start'; conversationId: string }
  | { type: 'typing.stop'; conversationId: string }

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

export type RealtimeEventHandler = (event: RealtimeEvent) => void
