import type { MessageRepository } from '../../../domain/repositories/message.repository.js';
import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { RealtimeNotifier } from '../../services/realtime-notifier.service.js';
import { logger } from '../../../infrastructure/shared/logger.js';

export interface HandleMessageStatusInput {
  externalMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestampMs: number;
}

export interface HandleMessageStatusOutput {
  updated: boolean;
  messageId?: string;
  conversationId?: string;
  status?: string;
}

/**
 * Processes Meta WhatsApp delivery/read webhook statuses and updates persisted messages.
 * When a status advances (sent → delivered → read), emits a realtime event to the admin panel.
 */
export class HandleMessageStatusUseCase {
  constructor(
    private readonly messageRepo: MessageRepository,
    private readonly conversationRepo?: ConversationRepository,
    private readonly realtimeNotifier?: RealtimeNotifier,
  ) {}

  async execute(input: HandleMessageStatusInput): Promise<HandleMessageStatusOutput> {
    const message = await this.messageRepo.findByExternalId(input.externalMessageId);
    if (!message) {
      logger.debug('[HandleMessageStatus] Message not found for externalId', {
        externalMessageId: input.externalMessageId,
        status: input.status,
      });
      return { updated: false };
    }

    const timestamp = new Date(input.timestampMs);
    const updatedMessage = message.applyStatusUpdate(input.status, timestamp);
    if (!updatedMessage) {
      logger.debug('[HandleMessageStatus] Status not advanced', {
        messageId: message.id.value,
        currentStatus: message.status,
        incomingStatus: input.status,
      });
      return {
        updated: false,
        messageId: message.id.value,
        conversationId: message.conversationId,
        status: message.status,
      };
    }

    await this.messageRepo.save(updatedMessage);

    logger.info('[HandleMessageStatus] Message status updated', {
      messageId: updatedMessage.id.value,
      conversationId: updatedMessage.conversationId,
      status: updatedMessage.status,
      externalMessageId: input.externalMessageId,
    });

    if (this.realtimeNotifier && this.conversationRepo) {
      const conversation = await this.conversationRepo.findById(updatedMessage.conversationId);
      if (conversation) {
        this.realtimeNotifier.notifyMessageStatus({
          conversationId: conversation.id,
          conversationMode: conversation.mode,
          assignedAgentId: conversation.assignedAgentId,
          messageId: updatedMessage.id.value,
          status: updatedMessage.status,
          deliveredAt: updatedMessage.deliveredAt,
          readAt: updatedMessage.readAt,
        });
      }
    }

    return {
      updated: true,
      messageId: updatedMessage.id.value,
      conversationId: updatedMessage.conversationId,
      status: updatedMessage.status,
    };
  }
}
