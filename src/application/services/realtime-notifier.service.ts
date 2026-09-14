import type { RealtimePort, RealtimeEvent, MessageEventData } from '../ports/realtime.port.js';
import type { Message } from '../../domain/entities/message.entity.js';
import type { ConversationMode } from '../../domain/entities/conversation.entity.js';
import type { MessageStatus } from '../../domain/entities/message.entity.js';

/**
 * Application service that decides who should receive a realtime event
 * based on the conversation access rules, then delegates to RealtimePort.
 *
 * Fan-out rules (mirrors assertCanViewConversation):
 *   - mode=bot   → broadcastToAll  (admins + all agents can view bot conversations)
 *   - mode=human → broadcastToAdmins + sendToAgent(assignedAgentId) if assigned
 */
export class RealtimeNotifier {
  constructor(private readonly realtime: RealtimePort) {}

  notifyNewMessage(params: {
    conversationId: string;
    conversationMode: ConversationMode;
    assignedAgentId: string | null;
    message: Message;
  }): void {
    const event: RealtimeEvent = {
      type: 'message.new',
      conversationId: params.conversationId,
      message: this.toEventData(params.message),
    };
    this.fanOut(event, params.conversationMode, params.assignedAgentId);
  }

  notifyMessageStatus(params: {
    conversationId: string;
    conversationMode: ConversationMode;
    assignedAgentId: string | null;
    messageId: string;
    status: MessageStatus;
    deliveredAt: Date | undefined;
    readAt: Date | undefined;
  }): void {
    const base = {
      type: 'message.status' as const,
      conversationId: params.conversationId,
      messageId: params.messageId,
      status: params.status,
    };
    const event: RealtimeEvent = params.deliveredAt !== undefined || params.readAt !== undefined
      ? {
          ...base,
          ...(params.deliveredAt !== undefined && { deliveredAt: params.deliveredAt.toISOString() }),
          ...(params.readAt !== undefined && { readAt: params.readAt.toISOString() }),
        }
      : base;

    this.fanOut(event, params.conversationMode, params.assignedAgentId);
  }

  notifyConversationRead(params: {
    conversationId: string;
    conversationMode: ConversationMode;
    assignedAgentId: string | null;
    unreadCountAgent: number;
  }): void {
    const event: RealtimeEvent = {
      type: 'conversation.read',
      conversationId: params.conversationId,
      unreadCountAgent: params.unreadCountAgent,
    };
    this.fanOut(event, params.conversationMode, params.assignedAgentId);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private fanOut(
    event: RealtimeEvent,
    mode: ConversationMode,
    assignedAgentId: string | null,
  ): void {
    if (mode === 'bot') {
      this.realtime.broadcastToAll(event);
    } else {
      if (assignedAgentId !== null) {
        this.realtime.broadcastToAdmins(event);
        this.realtime.sendToAgent(assignedAgentId, event);
      } else {
        // Unassigned human handoff — notify all agents so someone can claim the chat.
        this.realtime.broadcastToAll(event);
      }
    }
  }

  private toEventData(message: Message): MessageEventData {
    const base: MessageEventData = {
      id: message.id.value,
      role: message.role,
      content: message.content,
      status: message.status,
      timestamp: message.timestamp.toISOString(),
    };
    if (message.externalId !== undefined) base.externalId = message.externalId;
    if (message.contentType !== 'text') base.contentType = message.contentType;
    if (message.mediaUrl !== undefined) base.mediaUrl = message.mediaUrl;
    if (message.mimeType !== undefined) base.mimeType = message.mimeType;
    if (message.fileName !== undefined) base.fileName = message.fileName;
    if (message.caption !== undefined) base.caption = message.caption;
    if (message.deliveredAt !== undefined) base.deliveredAt = message.deliveredAt.toISOString();
    if (message.readAt !== undefined) base.readAt = message.readAt.toISOString();
    if (message.metadata !== undefined) base.metadata = message.metadata;
    return base;
  }
}
