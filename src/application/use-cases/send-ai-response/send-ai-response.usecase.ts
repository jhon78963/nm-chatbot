import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { AiProviderPort } from '../../ports/ai-provider.port.js';
import type { MessagingProviderPort } from '../../ports/messaging-provider.port.js';
import { Message } from '../../../domain/entities/message.entity.js';
import { MessageId } from '../../../domain/value-objects/message-id.vo.js';
import type { SendAiResponseDto, SendAiResponseResult } from './send-ai-response.dto.js';
import { DomainException } from '../../../domain/exceptions/domain.exception.js';
import { formatWhatsAppText } from '../../../infrastructure/webhooks/meta/format-whatsapp-text.js';

/**
 * Generates an AI response for an existing conversation and sends it via messaging.
 */
export class SendAiResponseUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly aiProvider: AiProviderPort,
    private readonly messagingProvider: MessagingProviderPort,
  ) {}

  async execute(dto: SendAiResponseDto): Promise<SendAiResponseResult> {
    const conversation = await this.conversationRepo.findById(dto.conversationId);
    if (!conversation) {
      throw new DomainException(
        `Conversation not found: ${dto.conversationId}`,
        'CONVERSATION_NOT_FOUND',
      );
    }

    const systemPrompt =
      dto.systemPromptOverride ?? conversation.systemPrompt ?? 'Eres un asistente virtual de UPRIT.';

    const messages = conversation.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    const aiResult = await this.aiProvider.complete([
      { role: 'system', content: systemPrompt },
      ...messages,
    ]);

    const assistantMessage = Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      role: 'assistant',
      content: aiResult.content,
      status: 'processing',
      timestamp: new Date(),
      metadata: { model: aiResult.model, tokens: aiResult.totalTokens },
    });

    const updatedConversation = conversation.addMessage(assistantMessage);
    await this.conversationRepo.save(updatedConversation);

    const replyText = formatWhatsAppText(aiResult.content);

    await this.messagingProvider.sendTextMessage({
      to: conversation.phoneNumber,
      body: replyText,
    });

    return {
      messageId: assistantMessage.id.value,
      content: replyText,
      tokensUsed: aiResult.totalTokens,
    };
  }
}
