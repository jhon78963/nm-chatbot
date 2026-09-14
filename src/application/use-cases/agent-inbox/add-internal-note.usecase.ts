import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import { Message } from '../../../domain/entities/message.entity.js';
import { MessageId } from '../../../domain/value-objects/message-id.vo.js';
import { ForbiddenError, assertCanViewConversation } from '../../services/conversation-access.service.js';
import type { RealtimeNotifier } from '../../services/realtime-notifier.service.js';

export { ForbiddenError };

export interface AddInternalNoteInput {
  conversationId: string;
  agentId: string;
  role: AgentRole;
  content: string;
}

export interface AddInternalNoteOutput {
  id: string;
  role: 'internal';
  content: string;
  timestamp: Date;
  metadata: { agentId: string };
}

export class AddInternalNoteUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly realtimeNotifier?: RealtimeNotifier,
  ) {}

  async execute(input: AddInternalNoteInput): Promise<AddInternalNoteOutput> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) throw new Error('Conversación no encontrada');

    assertCanViewConversation(conversation, input.agentId, input.role);

    if (!input.content.trim()) throw new Error('El contenido de la nota no puede estar vacío');

    const note = Message.create({
      id: MessageId.generate(),
      conversationId: input.conversationId,
      role: 'internal',
      content: input.content.trim(),
      status: 'sent',
      timestamp: new Date(),
      metadata: { agentId: input.agentId },
    });

    const updated = conversation.addMessage(note);
    await this.conversationRepo.save(updated);

    if (this.realtimeNotifier) {
      this.realtimeNotifier.notifyNewMessage({
        conversationId: input.conversationId,
        conversationMode: updated.mode,
        assignedAgentId: updated.assignedAgentId,
        message: note,
      });
    }

    return {
      id: note.id.value,
      role: 'internal',
      content: note.content,
      timestamp: note.timestamp,
      metadata: { agentId: input.agentId },
    };
  }
}
