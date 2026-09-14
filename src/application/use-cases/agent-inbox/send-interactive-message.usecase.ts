import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type {
  MessagingProviderPort,
  OutboundInteractiveButtonsMessage,
  OutboundInteractiveListMessage,
  OutboundCtaUrlMessage,
  InteractiveButton,
  InteractiveListSection,
} from '../../ports/messaging-provider.port.js';
import type { FunnelMessageMongoRepository } from '../../../infrastructure/database/mongodb/repositories/funnel-message.mongo-repository.js';
import type { RealtimeNotifier } from '../../services/realtime-notifier.service.js';
import { Message } from '../../../domain/entities/message.entity.js';
import { MessageId } from '../../../domain/value-objects/message-id.vo.js';
import {
  assertAgentOwnsConversation,
  ForbiddenError,
} from '../../services/conversation-access.service.js';

export { ForbiddenError };

// ── Input DTOs ─────────────────────────────────────────────────────────────

export interface SendInteractiveButtonsInput {
  type: 'buttons';
  conversationId: string;
  agentId: string;
  body: string;
  /** Max 3 buttons; extras are silently dropped. */
  buttons: InteractiveButton[];
}

export interface SendInteractiveListInput {
  type: 'list';
  conversationId: string;
  agentId: string;
  body: string;
  buttonText: string;
  sections: InteractiveListSection[];
}

export interface SendCtaUrlInput {
  type: 'cta_url';
  conversationId: string;
  agentId: string;
  body: string;
  displayText: string;
  url: string;
}

export type SendInteractiveInput =
  | SendInteractiveButtonsInput
  | SendInteractiveListInput
  | SendCtaUrlInput;

export interface SendInteractiveOutput {
  messageId: string;
  status: string;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export class SendInteractiveMessageUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly messagingProvider: MessagingProviderPort,
    private readonly funnelMessageRepo: FunnelMessageMongoRepository,
    private readonly realtimeNotifier?: RealtimeNotifier,
  ) {}

  async execute(input: SendInteractiveInput): Promise<SendInteractiveOutput> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) throw new Error('Conversación no encontrada');

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

    // Build summary text for DB storage
    const summaryText = this.buildSummary(input);

    // Dispatch to Meta adapter
    const result = await this.dispatch(input, conversation.phoneNumber);

    // Persist as interactive message in conversation history
    const agentMsg = Message.create({
      id: MessageId.generate(),
      conversationId: conversation.id,
      externalId: result.messageId,
      role: 'agent',
      content: summaryText,
      contentType: 'interactive',
      status: 'sent',
      timestamp: now,
      metadata: { agentId: input.agentId, interactiveType: input.type },
    });

    const updated = conversation.addMessage(agentMsg).withLastAgentMessageAt(now);
    await this.conversationRepo.save(updated);

    this.realtimeNotifier?.notifyNewMessage({
      conversationId: conversation.id,
      conversationMode: conversation.mode,
      assignedAgentId: conversation.assignedAgentId,
      message: agentMsg,
    });

    await this.funnelMessageRepo.saveAgentMessage({
      funnelUserId: conversation.userId,
      text: summaryText,
      agentId: input.agentId,
    });

    return { messageId: result.messageId, status: 'sent' };
  }

  private async dispatch(
    input: SendInteractiveInput,
    phoneNumber: string,
  ): Promise<{ messageId: string }> {
    switch (input.type) {
      case 'buttons': {
        if (!this.messagingProvider.sendInteractiveButtons) {
          throw new Error('El proveedor no soporta mensajes interactivos con botones');
        }
        const payload: OutboundInteractiveButtonsMessage = {
          to: phoneNumber,
          body: input.body,
          buttons: input.buttons.slice(0, 3),
        };
        return this.messagingProvider.sendInteractiveButtons(payload);
      }
      case 'list': {
        if (!this.messagingProvider.sendInteractiveList) {
          throw new Error('El proveedor no soporta mensajes interactivos de lista');
        }
        const payload: OutboundInteractiveListMessage = {
          to: phoneNumber,
          body: input.body,
          buttonText: input.buttonText,
          sections: input.sections,
        };
        return this.messagingProvider.sendInteractiveList(payload);
      }
      case 'cta_url': {
        if (!this.messagingProvider.sendCtaUrl) {
          throw new Error('El proveedor no soporta mensajes CTA URL');
        }
        const payload: OutboundCtaUrlMessage = {
          to: phoneNumber,
          body: input.body,
          displayText: input.displayText,
          url: input.url,
        };
        return this.messagingProvider.sendCtaUrl(payload);
      }
    }
  }

  private buildSummary(input: SendInteractiveInput): string {
    switch (input.type) {
      case 'buttons': {
        const labels = input.buttons.slice(0, 3).map((b) => b.title).join(' / ');
        return `${input.body} [Botones: ${labels}]`;
      }
      case 'list': {
        const total = input.sections.reduce((n, s) => n + s.rows.length, 0);
        return `${input.body} [Lista: ${total} opción(es)]`;
      }
      case 'cta_url':
        return `${input.body} [${input.displayText}: ${input.url}]`;
    }
  }
}
