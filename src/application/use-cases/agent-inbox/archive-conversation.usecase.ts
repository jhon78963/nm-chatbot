import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import { ForbiddenError } from '../../services/conversation-access.service.js';

export interface ArchiveConversationInput {
  conversationId: string;
  agentId: string;
  role: AgentRole;
  /** true = archive, false = unarchive */
  archive: boolean;
}

export interface ArchiveConversationOutput {
  id: string;
  archivedAt: Date | null;
}

export class ArchiveConversationUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(input: ArchiveConversationInput): Promise<ArchiveConversationOutput> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) throw new Error('Conversación no encontrada');

    const isAdmin = input.role === 'admin';
    const isAssigned = conversation.assignedAgentId === input.agentId;
    if (!isAdmin && !isAssigned) {
      throw new ForbiddenError('Solo el agente asignado o un admin puede archivar conversaciones');
    }

    const mutated = input.archive ? conversation.archive() : conversation.unarchive();
    const updated = await this.conversationRepo.save(mutated);
    return { id: updated.id, archivedAt: updated.archivedAt };
  }
}
