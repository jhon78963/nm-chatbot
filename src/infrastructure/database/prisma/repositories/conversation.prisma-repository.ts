import { Prisma } from '@prisma/client';
import type { ConversationRepository, InboxPagination } from '../../../../domain/repositories/conversation.repository.js';
import type { InboxQueryFilters } from '../../../../domain/types/inbox-query-filters.js';
import {
  Conversation,
  type HandoffState,
  type HandoffBy,
  type ConversationMode,
  type ConversationMetaData,
} from '../../../../domain/entities/conversation.entity.js';
import { Message } from '../../../../domain/entities/message.entity.js';
import { MessageId } from '../../../../domain/value-objects/message-id.vo.js';
import { getPrismaClient } from '../prisma.client.js';

type ChatConversationRecord = {
  id: string;
  userId: string;
  phoneNumber: string;
  status: string;
  mode: string;
  handoffState: string;
  consecutiveHandoffs: number;
  assignedAgentId: string | null;
  handoffAt: Date | null;
  handoffBy: string | null;
  lastUserMessageAt: Date | null;
  lastAgentMessageAt: Date | null;
  unreadCountAgent: number;
  currentProgramName: string | null;
  labels: string[];
  pinned: boolean;
  archivedAt: Date | null;
  metaData: unknown;
  systemPrompt: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class ConversationPrismaRepository implements ConversationRepository {
  private readonly prisma = getPrismaClient();

  async findById(id: string): Promise<Conversation | null> {
    const doc = await this.prisma.chatConversation.findUnique({ where: { id } });
    if (!doc) return null;
    const messages = await this.loadMessages(id);
    return this.toDomain(doc, messages);
  }

  async findActiveByPhoneNumber(phoneNumber: string): Promise<Conversation | null> {
    const doc = await this.prisma.chatConversation.findFirst({
      where: { phoneNumber, status: 'active' },
    });
    if (!doc) return null;
    const messages = await this.loadMessages(doc.id);
    return this.toDomain(doc, messages);
  }

  async findByUserId(userId: string): Promise<Conversation[]> {
    const docs = await this.prisma.chatConversation.findMany({ where: { userId } });
    return Promise.all(
      docs.map(async (doc) => {
        const messages = await this.loadMessages(doc.id);
        return this.toDomain(doc, messages);
      }),
    );
  }

  async findHumanByAgentId(agentId: string, opts: InboxPagination): Promise<Conversation[]> {
    const where = await this.buildInboxWhere(
      {
        mode: 'human',
        status: 'active',
        assignedAgentId: agentId,
      },
      opts.filters,
    );

    const docs = await this.prisma.chatConversation.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      skip: opts.offset,
      take: opts.limit,
    });

    return docs.map((doc) => this.toDomain(doc, []));
  }

  async countHumanByAgentId(agentId: string, filters?: InboxQueryFilters): Promise<number> {
    const where = await this.buildInboxWhere(
      {
        mode: 'human',
        status: 'active',
        assignedAgentId: agentId,
      },
      filters,
    );
    return this.prisma.chatConversation.count({ where });
  }

  async findBotModeForInbox(opts: { since: Date } & InboxPagination): Promise<Conversation[]> {
    const where = await this.buildInboxWhere(
      {
        mode: 'bot',
        status: 'active',
        OR: [{ updatedAt: { gte: opts.since } }, { lastUserMessageAt: { gte: opts.since } }],
      },
      opts.filters,
    );

    const docs = await this.prisma.chatConversation.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      skip: opts.offset,
      take: opts.limit,
    });

    return docs.map((doc) => this.toDomain(doc, []));
  }

  async countBotModeForInbox(since: Date, filters?: InboxQueryFilters): Promise<number> {
    const where = await this.buildInboxWhere(
      {
        mode: 'bot',
        status: 'active',
        OR: [{ updatedAt: { gte: since } }, { lastUserMessageAt: { gte: since } }],
      },
      filters,
    );
    return this.prisma.chatConversation.count({ where });
  }

  async findAdminInbox(opts: { since: Date } & InboxPagination): Promise<Conversation[]> {
    const where = await this.buildInboxWhere(
      {
        status: 'active',
        OR: [{ updatedAt: { gte: opts.since } }, { lastUserMessageAt: { gte: opts.since } }],
      },
      opts.filters,
    );

    const docs = await this.prisma.chatConversation.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      skip: opts.offset,
      take: opts.limit,
    });

    return docs.map((doc) => this.toDomain(doc, []));
  }

  async countAdminInbox(since: Date, filters?: InboxQueryFilters): Promise<number> {
    const where = await this.buildInboxWhere(
      {
        status: 'active',
        OR: [{ updatedAt: { gte: since } }, { lastUserMessageAt: { gte: since } }],
      },
      filters,
    );
    return this.prisma.chatConversation.count({ where });
  }

  async findLatestByPhoneNumbers(phoneNumbers: string[]): Promise<Map<string, Conversation>> {
    if (phoneNumbers.length === 0) return new Map();

    const variants = new Set<string>();
    for (const p of phoneNumbers) {
      const normalized = p.trim().replace(/^\+/, '');
      variants.add(normalized);
      variants.add(`+${normalized}`);
    }

    const docs = await this.prisma.chatConversation.findMany({
      where: { phoneNumber: { in: [...variants] } },
    });

    const grouped = new Map<string, ChatConversationRecord[]>();
    for (const doc of docs) {
      const key = doc.phoneNumber.replace(/^\+/, '');
      const list = grouped.get(key) ?? [];
      list.push(doc);
      grouped.set(key, list);
    }

    const result = new Map<string, Conversation>();
    for (const [key, group] of grouped) {
      group.sort((a, b) => {
        const aActive = a.status === 'active';
        const bActive = b.status === 'active';
        if (aActive && !bActive) return -1;
        if (bActive && !aActive) return 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
      result.set(key, this.toDomain(group[0]!, []));
    }

    return result;
  }

  async save(conversation: Conversation): Promise<Conversation> {
    const props = conversation.toProps();

    await this.prisma.chatConversation.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        userId: props.userId,
        phoneNumber: props.phoneNumber,
        status: props.status,
        systemPrompt: props.systemPrompt ?? null,
        mode: props.mode,
        handoffState: props.handoffState,
        consecutiveHandoffs: props.consecutiveHandoffs,
        assignedAgentId: props.assignedAgentId,
        handoffAt: props.handoffAt,
        handoffBy: props.handoffBy,
        lastUserMessageAt: props.lastUserMessageAt,
        lastAgentMessageAt: props.lastAgentMessageAt,
        unreadCountAgent: props.unreadCountAgent,
        currentProgramName: props.currentProgramName,
        labels: props.labels,
        pinned: props.pinned,
        archivedAt: props.archivedAt,
        metaData: this.buildMetaData(props.careerId, props.metaData),
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      update: {
        userId: props.userId,
        phoneNumber: props.phoneNumber,
        status: props.status,
        systemPrompt: props.systemPrompt ?? null,
        mode: props.mode,
        handoffState: props.handoffState,
        consecutiveHandoffs: props.consecutiveHandoffs,
        assignedAgentId: props.assignedAgentId,
        handoffAt: props.handoffAt,
        handoffBy: props.handoffBy,
        lastUserMessageAt: props.lastUserMessageAt,
        lastAgentMessageAt: props.lastAgentMessageAt,
        unreadCountAgent: props.unreadCountAgent,
        currentProgramName: props.currentProgramName,
        labels: props.labels,
        pinned: props.pinned,
        archivedAt: props.archivedAt,
        metaData: this.buildMetaData(props.careerId, props.metaData),
        updatedAt: props.updatedAt,
      },
    });

    if (props.messages.length > 0) {
      await this.prisma.$transaction(
        props.messages.map((m) => {
          const messageProps = m.toProps();
          const messageData = {
            id: messageProps.id.value,
            conversationId: messageProps.conversationId,
            externalId: messageProps.externalId ?? null,
            role: messageProps.role,
            content: messageProps.content,
            contentType: messageProps.contentType ?? 'text',
            mediaUrl: messageProps.mediaUrl ?? null,
            mimeType: messageProps.mimeType ?? null,
            fileName: messageProps.fileName ?? null,
            caption: messageProps.caption ?? null,
            status: messageProps.status,
            timestamp: messageProps.timestamp,
            deliveredAt: messageProps.deliveredAt ?? null,
            readAt: messageProps.readAt ?? null,
            ...(messageProps.metadata !== undefined
              ? { metadata: messageProps.metadata as Prisma.InputJsonValue }
              : {}),
          };
          return this.prisma.chatMessage.upsert({
            where: { id: messageProps.id.value },
            create: messageData,
            update: {
              role: messageData.role,
              content: messageData.content,
              contentType: messageData.contentType,
              externalId: messageData.externalId,
              mediaUrl: messageData.mediaUrl,
              mimeType: messageData.mimeType,
              fileName: messageData.fileName,
              caption: messageData.caption,
              status: messageData.status,
              timestamp: messageData.timestamp,
              deliveredAt: messageData.deliveredAt,
              readAt: messageData.readAt,
              ...(messageProps.metadata !== undefined
                ? { metadata: messageProps.metadata as Prisma.InputJsonValue }
                : {}),
            },
          });
        }),
      );
    }

    return conversation;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.chatConversation.delete({ where: { id } });
  }

  private buildMetaData(
    careerId: string | null,
    metaData: ConversationMetaData | null,
  ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
    const meta: Record<string, unknown> = {};
    if (metaData) {
      meta['filterType'] = metaData.filterType;
      meta['filterValue'] = metaData.filterValue;
    }
    if (careerId) {
      meta['careerId'] = careerId;
    }
    return Object.keys(meta).length === 0 ? Prisma.JsonNull : (meta as Prisma.InputJsonValue);
  }

  private async buildInboxWhere(
    base: Prisma.ChatConversationWhereInput,
    filters?: InboxQueryFilters,
  ): Promise<Prisma.ChatConversationWhereInput> {
    const clauses: Prisma.ChatConversationWhereInput[] = [];

    const baseWithArchived: Prisma.ChatConversationWhereInput = filters?.includeArchived
      ? base
      : { AND: [base, { archivedAt: null }] };

    clauses.push(baseWithArchived);

    if (!filters) {
      return clauses.length === 1 ? baseWithArchived : { AND: clauses };
    }

    if (filters.unreadOnly) {
      clauses.push({ unreadCountAgent: { gt: 0 } });
    }

    if (filters.unansweredOnly) {
      const unansweredIds = await this.findUnansweredConversationIds(baseWithArchived);
      clauses.push({ id: { in: unansweredIds } });
    }

    if (filters.searchQuery) {
      const searchOr: Prisma.ChatConversationWhereInput[] = [
        { phoneNumber: { contains: filters.searchQuery, mode: 'insensitive' } },
      ];
      if (filters.searchPhoneNumbers?.length) {
        searchOr.push({ phoneNumber: { in: filters.searchPhoneNumbers } });
      }
      clauses.push({ OR: searchOr });
    }

    if (filters.label) {
      clauses.push({
        labels: { has: filters.label },
      });
    }

    return clauses.length === 1 ? baseWithArchived : { AND: clauses };
  }

  private async findUnansweredConversationIds(
    baseWhere: Prisma.ChatConversationWhereInput,
  ): Promise<string[]> {
    const candidates = await this.prisma.chatConversation.findMany({
      where: {
        AND: [
          baseWhere,
          { lastUserMessageAt: { not: null } },
        ],
      },
      select: {
        id: true,
        lastUserMessageAt: true,
        lastAgentMessageAt: true,
      },
    });

    return candidates
      .filter(
        (c) =>
          c.lastUserMessageAt !== null &&
          (c.lastAgentMessageAt === null ||
            c.lastUserMessageAt.getTime() > c.lastAgentMessageAt.getTime()),
      )
      .map((c) => c.id);
  }

  private async loadMessages(conversationId: string): Promise<Message[]> {
    const docs = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'asc' },
    });

    return docs.map((d) =>
      Message.create({
        id: MessageId.from(d.id),
        conversationId: d.conversationId,
        ...(d.externalId !== null && d.externalId !== undefined && { externalId: d.externalId }),
        role: d.role as Message['role'],
        content: d.content,
        contentType: (d.contentType as Message['contentType']) ?? 'text',
        ...(d.mediaUrl !== null && d.mediaUrl !== undefined && { mediaUrl: d.mediaUrl }),
        ...(d.mimeType !== null && d.mimeType !== undefined && { mimeType: d.mimeType }),
        ...(d.fileName !== null && d.fileName !== undefined && { fileName: d.fileName }),
        ...(d.caption !== null && d.caption !== undefined && { caption: d.caption }),
        status: d.status as Message['status'],
        timestamp: d.timestamp,
        ...(d.deliveredAt !== null && d.deliveredAt !== undefined && { deliveredAt: d.deliveredAt }),
        ...(d.readAt !== null && d.readAt !== undefined && { readAt: d.readAt }),
        ...(d.metadata !== null &&
          d.metadata !== undefined && { metadata: d.metadata as Record<string, unknown> }),
      }),
    );
  }

  private toDomain(doc: ChatConversationRecord, messages: Message[]): Conversation {
    const rawMeta = doc.metaData as Record<string, unknown> | null;
    const careerId =
      rawMeta && typeof rawMeta['careerId'] === 'string' ? rawMeta['careerId'] : null;

    let metaData: ConversationMetaData | null = null;
    if (rawMeta && ('filterType' in rawMeta || 'filterValue' in rawMeta)) {
      metaData = {
        filterType: (rawMeta['filterType'] as string | null) ?? null,
        filterValue: rawMeta['filterValue'] as string | string[],
      };
    }

    const systemPrompt = doc.systemPrompt ?? undefined;

    return Conversation.create({
      id: doc.id,
      userId: doc.userId,
      phoneNumber: doc.phoneNumber,
      status: doc.status as 'active' | 'idle' | 'closed',
      messages,
      ...(systemPrompt !== undefined && { systemPrompt }),
      mode: (doc.mode as ConversationMode | undefined) ?? 'bot',
      handoffState: (doc.handoffState as HandoffState | undefined) ?? 'none',
      consecutiveHandoffs: doc.consecutiveHandoffs ?? 0,
      assignedAgentId: doc.assignedAgentId ?? null,
      handoffAt: doc.handoffAt ?? null,
      handoffBy: (doc.handoffBy as HandoffBy | null | undefined) ?? null,
      lastUserMessageAt: doc.lastUserMessageAt ?? null,
      lastAgentMessageAt: doc.lastAgentMessageAt ?? null,
      unreadCountAgent: doc.unreadCountAgent ?? 0,
      careerId,
      metaData,
      currentProgramName: doc.currentProgramName ?? null,
      labels: doc.labels ?? [],
      pinned: doc.pinned ?? false,
      archivedAt: doc.archivedAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }
}
