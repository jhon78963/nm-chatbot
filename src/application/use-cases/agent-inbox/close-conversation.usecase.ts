import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import {
  assertAgentOwnsConversation,
  ForbiddenError,
} from '../../services/conversation-access.service.js';

export { ForbiddenError };

export interface CloseConversationInput {
  conversationId: string;
  agentId: string;
}

export class CloseConversationUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(input: CloseConversationInput): Promise<void> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) {
      throw new Error('Conversación no encontrada');
    }

    assertAgentOwnsConversation(conversation, input.agentId);

    const updated = conversation.close();
    await this.conversationRepo.save(updated);
  }
}
