import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import { ForbiddenError } from '../../services/conversation-access.service.js';

export { ForbiddenError };

export interface ReassignConversationInput {
  conversationId: string;
  requestingAgentId: string;
  role: AgentRole;
  targetAgentId: string;
}

export interface ReassignConversationOutput {
  id: string;
  assignedAgentId: string;
  assignedAgentName: string | null;
}

export class ReassignConversationUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly agentRepo: AgentRepository,
  ) {}

  async execute(input: ReassignConversationInput): Promise<ReassignConversationOutput> {
    if (input.role !== 'admin') {
      throw new ForbiddenError('Solo un administrador puede reasignar conversaciones');
    }

    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) throw new Error('Conversación no encontrada');

    const targetAgent = await this.agentRepo.findById(input.targetAgentId);
    if (!targetAgent) throw new Error('Agente destino no encontrado');

    const updated = await this.conversationRepo.save(
      conversation.withHumanHandoff(input.targetAgentId, 'agent'),
    );

    return {
      id: updated.id,
      assignedAgentId: input.targetAgentId,
      assignedAgentName: targetAgent.name ?? null,
    };
  }
}
