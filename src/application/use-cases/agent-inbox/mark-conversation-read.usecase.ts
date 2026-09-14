import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { RealtimeNotifier } from '../../services/realtime-notifier.service.js';
import {
  assertAgentOwnsConversation,
  ForbiddenError,
} from '../../services/conversation-access.service.js';

export { ForbiddenError };

export interface MarkConversationReadInput {
  conversationId: string;
  agentId: string;
}

export class MarkConversationReadUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly realtimeNotifier?: RealtimeNotifier,
  ) {}

  async execute(input: MarkConversationReadInput): Promise<void> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) {
      throw new Error('Conversación no encontrada');
    }

    assertAgentOwnsConversation(conversation, input.agentId);

    const updated = conversation.resetUnread();
    await this.conversationRepo.save(updated);

    this.realtimeNotifier?.notifyConversationRead({
      conversationId: conversation.id,
      conversationMode: conversation.mode,
      assignedAgentId: conversation.assignedAgentId,
      unreadCountAgent: 0,
    });
  }
}
