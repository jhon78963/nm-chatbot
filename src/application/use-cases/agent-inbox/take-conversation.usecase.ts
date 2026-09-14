import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import type { MessageRepository } from '../../../domain/repositories/message.repository.js';
import type { MessagingProviderPort } from '../../ports/messaging-provider.port.js';
import type { FunnelUserPrismaRepository } from '../../../infrastructure/database/prisma/repositories/funnel-user.prisma-repository.js';
import type { FunnelMessageMongoRepository } from '../../../infrastructure/database/mongodb/repositories/funnel-message.mongo-repository.js';
import type { RealtimeNotifier } from '../../services/realtime-notifier.service.js';
import { isHandoffExcludedAgent } from '../../services/handoff-excluded-agents.js';
import { buildHandoffAssignedLeadMessage } from '../../services/handoff-lead-messages.service.js';
import { Message } from '../../../domain/entities/message.entity.js';
import { MessageId } from '../../../domain/value-objects/message-id.vo.js';
import { formatWhatsAppText } from '../../../infrastructure/webhooks/meta/format-whatsapp-text.js';

export interface TakeConversationInput {
  conversationId: string;
  agentId: string;
  agentUsername?: string | null;
}

export interface TakeConversationOutput {
  success: true;
  mode: 'human';
  assignedAgentId: string;
}

export class TakeConversationUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly funnelUserRepo: FunnelUserPrismaRepository,
    private readonly agentRepo: AgentRepository,
    private readonly messagingProvider: MessagingProviderPort,
    private readonly funnelMessageRepo: FunnelMessageMongoRepository,
    private readonly messageRepo?: MessageRepository,
    private readonly realtimeNotifier?: RealtimeNotifier,
  ) {}

  async execute(input: TakeConversationInput): Promise<TakeConversationOutput> {
    if (isHandoffExcludedAgent(input.agentUsername)) {
      throw new Error('Esta cuenta de prueba no puede tomar conversaciones');
    }

    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) {
      throw new Error('Conversación no encontrada');
    }

    const isUnassignedHuman = conversation.isHumanMode() && conversation.assignedAgentId === null;
    if (!conversation.isBotMode() && !isUnassignedHuman) {
      throw new Error('Este chat ya está en atención humana');
    }

    const agent = await this.agentRepo.findById(input.agentId);
    if (!agent) {
      throw new Error('Agente no encontrado');
    }

    const updated = conversation.withHumanHandoff(input.agentId, 'agent');
    const leadMessage = buildHandoffAssignedLeadMessage(agent);
    const replyText = formatWhatsAppText(leadMessage);

    const assistantMessage = Message.create({
      id: MessageId.generate(),
      conversationId: updated.id,
      role: 'assistant',
      content: replyText,
      status: 'processing',
      timestamp: new Date(),
      metadata: { model: 'handoff-assignment', assignedAgentId: agent.id },
    });

    const savedConversation = updated.addMessage(assistantMessage);
    await this.conversationRepo.save(savedConversation);

    const sendResult = await this.messagingProvider.sendTextMessage({
      to: conversation.phoneNumber,
      body: replyText,
    });

    if (this.messageRepo && sendResult.messageId) {
      const sentMessage = assistantMessage.withExternalId(sendResult.messageId).markAs('sent');
      await this.messageRepo.save(sentMessage);
    }

    this.realtimeNotifier?.notifyNewMessage({
      conversationId: savedConversation.id,
      conversationMode: savedConversation.mode,
      assignedAgentId: savedConversation.assignedAgentId,
      message: assistantMessage,
    });

    const funnelUser = await this.funnelUserRepo.findBySenderId(conversation.phoneNumber);
    if (funnelUser) {
      await this.funnelUserRepo.updateById({
        id: funnelUser.id,
        stage: 'HANDOFF',
        assignedAgent: input.agentId,
      });
      await this.funnelMessageRepo.saveBotMessage({ funnelUserId: funnelUser.id, text: replyText });
    }

    return {
      success: true,
      mode: 'human',
      assignedAgentId: input.agentId,
    };
  }
}
