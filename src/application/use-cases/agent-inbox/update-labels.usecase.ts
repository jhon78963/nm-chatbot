import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import { Conversation } from '../../../domain/entities/conversation.entity.js';
import { ForbiddenError } from '../../services/conversation-access.service.js';

export interface UpdateLabelsInput {
  conversationId: string;
  agentId: string;
  role: AgentRole;
  labels: string[];
}

export interface UpdateLabelsOutput {
  id: string;
  labels: string[];
}

export class UpdateLabelsUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(input: UpdateLabelsInput): Promise<UpdateLabelsOutput> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) throw new Error('Conversación no encontrada');

    const isAdmin = input.role === 'admin';
    const isAssigned = conversation.assignedAgentId === input.agentId;
    if (!isAdmin && !isAssigned) {
      throw new ForbiddenError('Solo el agente asignado o un admin puede gestionar etiquetas');
    }

    if (input.labels.length > Conversation.MAX_LABELS) {
      throw new Error(`Máximo ${Conversation.MAX_LABELS} etiquetas por conversación`);
    }

    const updated = await this.conversationRepo.save(conversation.withLabels(input.labels));
    return { id: updated.id, labels: updated.labels };
  }
}
