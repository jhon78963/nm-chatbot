import type { ConversationRepository } from '../../../domain/repositories/conversation.repository.js';
import type { UserRepository } from '../../../domain/repositories/user.repository.js';
import type { AgentRepository } from '../../../domain/repositories/agent.repository.js';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import {
  assertCanViewConversation,
  ForbiddenError,
} from '../../services/conversation-access.service.js';
import type { Message } from '../../../domain/entities/message.entity.js';
import type { FunnelUserPrismaRepository } from '../../../infrastructure/database/prisma/repositories/funnel-user.prisma-repository.js';
import { computeCsWindow } from '../../services/cs-window.service.js';

export { ForbiddenError };

export interface GetConversationHistoryInput {
  conversationId: string;
  agentId: string;
  role?: AgentRole;
  limit?: number | undefined;
  /** Return only messages with timestamp strictly after this date (delta sync). */
  since?: Date;
}

export interface MessageDto {
  id: string;
  role: string;
  content: string;
  contentType?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  status: string;
  timestamp: Date;
  externalId?: string;
  deliveredAt?: Date;
  readAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface GetConversationHistoryOutput {
  conversationId: string;
  phoneNumber: string;
  contactName: string | null;
  userId: string;
  mode: string;
  status: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  unreadCountAgent: number;
  csWindowOpen: boolean;
  csWindowExpiresAt: string | null;
  labels: string[];
  pinned: boolean;
  archivedAt: Date | null;
  messages: MessageDto[];
}

export class GetConversationHistoryUseCase {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly userRepo: UserRepository,
    private readonly funnelUserRepo: FunnelUserPrismaRepository,
    private readonly agentRepo: AgentRepository,
  ) {}

  async execute(input: GetConversationHistoryInput): Promise<GetConversationHistoryOutput> {
    const conversation = await this.conversationRepo.findById(input.conversationId);
    if (!conversation) {
      throw new Error('Conversación no encontrada');
    }

    assertCanViewConversation(conversation, input.agentId, input.role ?? 'agent');

    let msgs: ReadonlyArray<Message> =
      input.limit !== undefined && input.limit > 0
        ? conversation.getLastNMessages(input.limit)
        : input.limit === 0
          ? []
          : conversation.messages;

    if (input.since) {
      msgs = msgs.filter((m) => m.timestamp > input.since!);
    }

    const [funnelUser, user, assignedAgent] = await Promise.all([
      this.funnelUserRepo.findBySenderId(conversation.phoneNumber),
      this.userRepo.findById(conversation.userId),
      conversation.assignedAgentId
        ? this.agentRepo.findById(conversation.assignedAgentId)
        : Promise.resolve(null),
    ]);
    const contactName = funnelUser?.name ?? user?.name ?? null;
    const csWindow = computeCsWindow(conversation.lastUserMessageAt);

    return {
      conversationId: conversation.id,
      phoneNumber: conversation.phoneNumber,
      contactName,
      userId: conversation.userId,
      mode: conversation.mode,
      status: conversation.status,
      assignedAgentId: conversation.assignedAgentId,
      assignedAgentName: assignedAgent?.name ?? null,
      unreadCountAgent: conversation.unreadCountAgent,
      csWindowOpen: csWindow.csWindowOpen,
      csWindowExpiresAt: csWindow.csWindowExpiresAt,
      labels: conversation.labels,
      pinned: conversation.pinned,
      archivedAt: conversation.archivedAt,
      messages: msgs.map((m) => ({
        id: m.id.value,
        role: m.role,
        content: m.content,
        contentType: m.contentType,
        ...(m.mediaUrl !== undefined && { mediaUrl: m.mediaUrl }),
        ...(m.mimeType !== undefined && { mimeType: m.mimeType }),
        ...(m.fileName !== undefined && { fileName: m.fileName }),
        ...(m.caption !== undefined && { caption: m.caption }),
        status: m.status,
        timestamp: m.timestamp,
        ...(m.externalId !== undefined && { externalId: m.externalId }),
        ...(m.deliveredAt !== undefined && { deliveredAt: m.deliveredAt }),
        ...(m.readAt !== undefined && { readAt: m.readAt }),
        ...(m.metadata !== undefined && { metadata: m.metadata }),
      })),
    };
  }
}
