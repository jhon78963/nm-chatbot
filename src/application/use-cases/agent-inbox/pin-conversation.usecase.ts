import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import { ForbiddenError } from '../../services/conversation-access.service.js';

export interface PinConversationInput {
  conversationId: string;
  agentId: string;
  role: AgentRole;
  pinned: boolean;
}

export interface PinConversationOutput {
  id: string;
  pinned: boolean;
}

export class PinConversationUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(input: PinConversationInput): Promise<PinConversationOutput> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) throw new Error('Conversación no encontrada');

    const isAdmin = input.role === 'admin';
    const isAssigned = conversation.assignedAgentId === input.agentId;
    if (!isAdmin && !isAssigned) {
      throw new ForbiddenError('Solo el agente asignado o un admin puede fijar conversaciones');
    }

    const updated = await this.conversationRepo.save(conversation.withPinned(input.pinned));
    return { id: updated.id, pinned: updated.pinned };
  }
}
