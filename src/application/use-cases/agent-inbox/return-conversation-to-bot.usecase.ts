import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import {
  assertAgentOwnsConversation,
  ForbiddenError,
} from '../../services/conversation-access.service.js';

export { ForbiddenError };

export interface ReturnConversationToBotInput {
  conversationId: string;
  agentId: string;
}

export class ReturnConversationToBotUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(input: ReturnConversationToBotInput): Promise<void> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) {
      throw new Error('Conversación no encontrada');
    }

    assertAgentOwnsConversation(conversation, input.agentId);

    const updated = conversation.withBotMode();
    await this.conversationRepo.save(updated);
  }
}
