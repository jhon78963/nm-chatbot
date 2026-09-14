import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { MessagingProviderPort } from '../../ports/messaging-provider.port.js';
import type { MediaStoragePort } from '../../ports/media-storage.port.js';
import type { FunnelMessageMongoRepository } from '../../../infrastructure/database/mongodb/repositories/funnel-message.mongo-repository.js';
import type { RealtimeNotifier } from '../../services/realtime-notifier.service.js';
import type { MetaMediaService } from '../../../infrastructure/webhooks/meta/meta-media.service.js';
import { Message } from '../../../domain/entities/message.entity.js';
import type { MessageContentType } from '../../../domain/entities/message.entity.js';
import { MessageId } from '../../../domain/value-objects/message-id.vo.js';
import {
  assertAgentOwnsConversation,
  ForbiddenError,
} from '../../services/conversation-access.service.js';

export { ForbiddenError };

export interface SendAgentMessageInput {
  conversationId: string;
  agentId: string;
  content?: string;
  contentType?: MessageContentType;
  fileBuffer?: Buffer;
  mimeType?: string;
  fileName?: string;
}

export interface SendAgentMessageOutput {
  messageId: string;
  status: string;
  contentType: MessageContentType;
  mediaUrl?: string;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export class SendAgentMessageUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly messagingProvider: MessagingProviderPort,
    private readonly funnelMessageRepo: FunnelMessageMongoRepository,
    private readonly metaMediaService: MetaMediaService,
    private readonly mediaStorage: MediaStoragePort,
    private readonly realtimeNotifier?: RealtimeNotifier,
  ) {}

  async execute(input: SendAgentMessageInput): Promise<SendAgentMessageOutput> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) {
      throw new Error('Conversación no encontrada');
    }

    assertAgentOwnsConversation(conversation, input.agentId);

    if (!conversation.isHumanMode()) {
      throw new Error('La conversación no está en modo humano');
    }

    const now = new Date();
    if (
      !conversation.lastUserMessageAt ||
      now.getTime() - conversation.lastUserMessageAt.getTime() > TWENTY_FOUR_HOURS_MS
    ) {
      throw new Error(
        'Ventana de 24 horas expirada. El lead debe escribir primero para reabrir la ventana.',
      );
    }

    const hasFile = Boolean(input.fileBuffer && input.mimeType);
    const caption = input.content?.trim() ?? '';

    if (!hasFile && !caption) {
      throw new Error('content o file es requerido');
    }

    let resultMessageId: string;
    let contentType: MessageContentType = input.contentType ?? 'text';
    let messageContent = caption;
    let mediaUrl: string | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;

    if (hasFile && input.fileBuffer && input.mimeType) {
      const mime = input.mimeType;
      if (input.contentType) {
        contentType = input.contentType;
      } else if (mime.startsWith('image/')) {
        contentType = 'image';
      } else if (mime.startsWith('audio/')) {
        contentType = 'audio';
      } else if (mime.startsWith('video/')) {
        contentType = 'video';
      } else {
        contentType = 'document';
      }
      mimeType = mime;
      fileName = input.fileName;
      messageContent = caption || input.fileName || `[${contentType}]`;

      const { mediaId } = await this.metaMediaService.uploadMedia(input.fileBuffer, mime);

      const saved = await this.mediaStorage.save(input.fileBuffer, {
        mimeType: mime,
        conversationId: conversation.id,
        ...(input.fileName !== undefined && { originalName: input.fileName }),
      });
      mediaUrl = saved.publicPath;

      // Map domain contentType to Meta media type
      const waType: 'image' | 'document' | 'audio' | 'video' =
        contentType === 'audio' ? 'audio'
        : contentType === 'video' ? 'video'
        : contentType === 'image' ? 'image'
        : 'document';

      const result = await this.messagingProvider.sendMediaMessage({
        to: conversation.phoneNumber,
        type: waType,
        mediaId,
        ...(caption && contentType !== 'audio' && { caption }),
        ...(contentType === 'document' && input.fileName && { fileName: input.fileName }),
      });
      resultMessageId = result.messageId;
    } else {
      const result = await this.messagingProvider.sendTextMessage({
        to: conversation.phoneNumber,
        body: caption,
      });
      resultMessageId = result.messageId;
    }

    const agentMsg = Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      externalId: resultMessageId,
      role: 'agent',
      content: messageContent,
      contentType,
      ...(mediaUrl !== undefined && { mediaUrl }),
      ...(mimeType !== undefined && { mimeType }),
      ...(fileName !== undefined && { fileName }),
      ...(caption && contentType !== 'text' && { caption }),
      status: 'sent',
      timestamp: now,
      metadata: { agentId: input.agentId },
    });

    const updated = conversation
      .addMessage(agentMsg)
      .withLastAgentMessageAt(now);

    await this.conversationRepo.save(updated);

    this.realtimeNotifier?.notifyNewMessage({
      conversationId: conversation.id,
      conversationMode: conversation.mode,
      assignedAgentId: conversation.assignedAgentId,
      message: agentMsg,
    });

    await this.funnelMessageRepo.saveAgentMessage({
      funnelUserId: conversation.userId,
      text: messageContent,
      agentId: input.agentId,
      ...(contentType !== 'text' && mediaUrl !== undefined && { contentType, mediaUrl }),
    });

    return {
      messageId: resultMessageId,
      status: 'sent',
      contentType,
      ...(mediaUrl !== undefined && { mediaUrl }),
    };
  }
}
