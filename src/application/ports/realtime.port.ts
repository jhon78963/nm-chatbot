import type { MessageRole, MessageStatus } from '../../domain/entities/message.entity.js';

// ─── Event payloads (Server → Client) ───────────────────────────────────────

export interface MessageEventData {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  timestamp: string;         // ISO 8601
  contentType?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  externalId?: string;
  deliveredAt?: string;      // ISO 8601
  readAt?: string;           // ISO 8601
  metadata?: Record<string, unknown>;
}

/**
 * Union of all business events the server pushes to the admin panel over WebSocket.
 *
 * | type                | when emitted                                    |
 * |---------------------|-------------------------------------------------|
 * | `message.new`       | New inbound user msg or outbound agent/bot msg  |
 * | `message.status`    | Meta webhook: delivered / read / failed         |
 * | `conversation.read` | Agent marks conversation as read                |
 */
export type RealtimeEvent =
  | { type: 'message.new';       conversationId: string; message: MessageEventData }
  | { type: 'message.status';    conversationId: string; messageId: string; status: MessageStatus; deliveredAt?: string; readAt?: string }
  | { type: 'conversation.read'; conversationId: string; unreadCountAgent: number };

// ─── Port ────────────────────────────────────────────────────────────────────

/**
 * Port for the realtime (WebSocket) infrastructure layer.
 * Use RealtimeNotifier (application service) instead of calling this directly from use cases.
 */
export interface RealtimePort {
  /** Attach WS server to the HTTP server and start accepting connections. */
  start(httpServer: import('node:http').Server): void;

  /** Gracefully close all connections and timers. */
  stop(): Promise<void>;

  /** Number of distinct agent IDs with at least one open socket. */
  getConnectedAgentCount(): number;

  /** Send event to all open sockets of a specific agent (all browser tabs). */
  sendToAgent(agentId: string, event: RealtimeEvent): void;

  /** Broadcast event only to connections whose JWT role is 'admin'. */
  broadcastToAdmins(event: RealtimeEvent): void;

  /** Broadcast event to every connected socket regardless of role. */
  broadcastToAll(event: RealtimeEvent): void;
}
