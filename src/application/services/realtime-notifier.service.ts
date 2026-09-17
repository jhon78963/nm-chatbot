import type { RealtimePort, RealtimeEvent, MessageEventData } from '../ports/realtime.port.js';
import type { Message } from '../../domain/entities/message.entity.js';
import type { ConversationMode } from '../../domain/entities/conversation.entity.js';
import type { MessageStatus } from '../../domain/entities/message.entity.js';
import { currentWhatsAppAccount } from '../../infrastructure/whatsapp/tenant-whatsapp-registry.js';

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
    tenantId?: string;
  }): void {
    const event: RealtimeEvent = {
      type: 'message.new',
      conversationId: params.conversationId,
      message: this.toEventData(params.message),
    };
    this.fanOut(event, params.conversationMode, params.assignedAgentId, params.tenantId);
  }

  notifyMessageStatus(params: {
    conversationId: string;
    conversationMode: ConversationMode;
    assignedAgentId: string | null;
    messageId: string;
    status: MessageStatus;
    deliveredAt: Date | undefined;
    readAt: Date | undefined;
    tenantId?: string;
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

    this.fanOut(event, params.conversationMode, params.assignedAgentId, params.tenantId);
  }

  notifyConversationRead(params: {
    conversationId: string;
    conversationMode: ConversationMode;
    assignedAgentId: string | null;
    unreadCountAgent: number;
    tenantId?: string;
  }): void {
    const event: RealtimeEvent = {
      type: 'conversation.read',
      conversationId: params.conversationId,
      unreadCountAgent: params.unreadCountAgent,
    };
    this.fanOut(event, params.conversationMode, params.assignedAgentId, params.tenantId);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private fanOut(
    event: RealtimeEvent,
    mode: ConversationMode,
    assignedAgentId: string | null,
    tenantId?: string,
  ): void {
    const scope = tenantId ?? currentWhatsAppAccount()?.tenantId;
    if (mode === 'bot') {
      this.realtime.broadcastToAll(event, scope);
    } else {
      if (assignedAgentId !== null) {
        this.realtime.broadcastToAdmins(event, scope);
        this.realtime.sendToAgent(assignedAgentId, event);
      } else {
        this.realtime.broadcastToAll(event, scope);
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
