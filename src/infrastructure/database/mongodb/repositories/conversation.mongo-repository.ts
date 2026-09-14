import type { ConversationRepository, InboxPagination } from '../../../../domain/repositories/conversation.repository.js';
import type { InboxQueryFilters } from '../../../../domain/types/inbox-query-filters.js';
import {
  Conversation,
  type HandoffState,
  type HandoffBy,
  type ConversationMode,
  type ConversationMetaData,
} from '../../../../domain/entities/conversation.entity.js';
import { ConversationModel } from '../models/conversation.model.js';
import { MessageModel } from '../models/message.model.js';
import { Message } from '../../../../domain/entities/message.entity.js';
import { MessageId } from '../../../../domain/value-objects/message-id.vo.js';

export class ConversationMongoRepository implements ConversationRepository {
  async findById(id: string): Promise<Conversation | null> {
    const doc = await ConversationModel.findById(id).lean();
    if (!doc) return null;
    const messages = await this.loadMessages(id);
    return this.toDomain(doc, messages);
  }

  async findActiveByPhoneNumber(phoneNumber: string): Promise<Conversation | null> {
    const doc = await ConversationModel.findOne({ phoneNumber, status: 'active' }).lean();
    if (!doc) return null;
    const messages = await this.loadMessages(String(doc._id));
    return this.toDomain(doc, messages);
  }

  async findByUserId(userId: string): Promise<Conversation[]> {
    const docs = await ConversationModel.find({ userId }).lean();
    return Promise.all(
      docs.map(async (doc) => {
        const messages = await this.loadMessages(String(doc._id));
        return this.toDomain(doc, messages);
      }),
    );
  }

  async findHumanByAgentId(
    agentId: string,
    opts: InboxPagination,
  ): Promise<Conversation[]> {
    const query = this.applyInboxFilters(
      {
        mode: 'human',
        status: 'active',
        assignedAgentId: agentId,
      },
      opts.filters,
    );

    const docs = await ConversationModel.find(query)
      .sort({ pinned: -1, updatedAt: -1 })
      .skip(opts.offset)
      .limit(opts.limit)
      .lean();

    return docs.map((doc) => this.toDomain(doc, []));
  }

  async countHumanByAgentId(agentId: string, filters?: InboxQueryFilters): Promise<number> {
    const query = this.applyInboxFilters(
      {
        mode: 'human',
        status: 'active',
        assignedAgentId: agentId,
      },
      filters,
    );
    return ConversationModel.countDocuments(query);
  }

  async findBotModeForInbox(opts: {
    since: Date;
  } & InboxPagination): Promise<Conversation[]> {
    const query = this.applyInboxFilters(
      {
        mode: 'bot',
        status: 'active',
        $or: [{ updatedAt: { $gte: opts.since } }, { lastUserMessageAt: { $gte: opts.since } }],
      },
      opts.filters,
    );

    const docs = await ConversationModel.find(query)
      .sort({ pinned: -1, updatedAt: -1 })
      .skip(opts.offset)
      .limit(opts.limit)
      .lean();

    return docs.map((doc) => this.toDomain(doc, []));
  }

  async countBotModeForInbox(since: Date, filters?: InboxQueryFilters): Promise<number> {
    const query = this.applyInboxFilters(
      {
        mode: 'bot',
        status: 'active',
        $or: [{ updatedAt: { $gte: since } }, { lastUserMessageAt: { $gte: since } }],
      },
      filters,
    );
    return ConversationModel.countDocuments(query);
  }

  async findAdminInbox(opts: { since: Date } & InboxPagination): Promise<Conversation[]> {
    const query = this.applyInboxFilters(
      {
        status: 'active',
        $or: [{ updatedAt: { $gte: opts.since } }, { lastUserMessageAt: { $gte: opts.since } }],
      },
      opts.filters,
    );

    const docs = await ConversationModel.find(query)
      .sort({ pinned: -1, updatedAt: -1 })
      .skip(opts.offset)
      .limit(opts.limit)
      .lean();

    return docs.map((doc) => this.toDomain(doc, []));
  }

  async countAdminInbox(since: Date, filters?: InboxQueryFilters): Promise<number> {
    const query = this.applyInboxFilters(
      {
        status: 'active',
        $or: [{ updatedAt: { $gte: since } }, { lastUserMessageAt: { $gte: since } }],
      },
      filters,
    );
    return ConversationModel.countDocuments(query);
  }

  private applyInboxFilters(
    base: Record<string, unknown>,
    filters?: InboxQueryFilters,
  ): Record<string, unknown> {
    // By default exclude archived conversations; admin can opt-in with includeArchived
    const baseWithArchived: Record<string, unknown> = filters?.includeArchived
      ? base
      : { ...base, archivedAt: null };

    if (!filters) return baseWithArchived;

    const clauses: Record<string, unknown>[] = [baseWithArchived];

    if (filters.unreadOnly) {
      clauses.push({ unreadCountAgent: { $gt: 0 } });
    }

    if (filters.unansweredOnly) {
      clauses.push({
        lastUserMessageAt: { $ne: null },
        $or: [
          { lastAgentMessageAt: null },
          { $expr: { $gt: ['$lastUserMessageAt', '$lastAgentMessageAt'] } },
        ],
      });
    }

    if (filters.searchQuery) {
      const escaped = filters.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchOr: Record<string, unknown>[] = [
        { phoneNumber: { $regex: escaped, $options: 'i' } },
      ];
      if (filters.searchPhoneNumbers?.length) {
        searchOr.push({ phoneNumber: { $in: filters.searchPhoneNumbers } });
      }
      clauses.push({ $or: searchOr });
    }

    if (filters.label) {
      const escaped = filters.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clauses.push({ labels: { $regex: escaped, $options: 'i' } });
    }

    return clauses.length === 1 ? baseWithArchived : { $and: clauses };
  }

  async findLatestByPhoneNumbers(phoneNumbers: string[]): Promise<Map<string, Conversation>> {
    if (phoneNumbers.length === 0) return new Map();

    const variants = new Set<string>();
    for (const p of phoneNumbers) {
      const normalized = p.trim().replace(/^\+/, '');
      variants.add(normalized);
      variants.add(`+${normalized}`);
    }

    const docs = await ConversationModel.find({ phoneNumber: { $in: [...variants] } }).lean();
    const grouped = new Map<string, Array<Record<string, unknown>>>();

    for (const doc of docs) {
      const key = String(doc.phoneNumber).replace(/^\+/, '');
      const list = grouped.get(key) ?? [];
      list.push(doc as Record<string, unknown>);
      grouped.set(key, list);
    }

    const result = new Map<string, Conversation>();
    for (const [key, group] of grouped) {
      group.sort((a, b) => {
        const aActive = a['status'] === 'active';
        const bActive = b['status'] === 'active';
        if (aActive && !bActive) return -1;
        if (bActive && !aActive) return 1;
        return (
          new Date(String(b['updatedAt'])).getTime() - new Date(String(a['updatedAt'])).getTime()
        );
      });
      result.set(key, this.toDomain(group[0]!, []));
    }

    return result;
  }

  async save(conversation: Conversation): Promise<Conversation> {
    const props = conversation.toProps();
    await ConversationModel.findByIdAndUpdate(
      props.id,
      {
        _id: props.id,
        userId: props.userId,
        phoneNumber: props.phoneNumber,
        status: props.status,
        systemPrompt: props.systemPrompt,
        mode: props.mode,
        handoffState: props.handoffState,
        consecutiveHandoffs: props.consecutiveHandoffs,
        assignedAgentId: props.assignedAgentId,
        handoffAt: props.handoffAt,
        handoffBy: props.handoffBy,
        lastUserMessageAt: props.lastUserMessageAt,
        lastAgentMessageAt: props.lastAgentMessageAt,
        unreadCountAgent: props.unreadCountAgent,
        careerId: props.careerId,
        metaData: props.metaData,
        currentProgramName: props.currentProgramName,
        labels: props.labels,
        pinned: props.pinned,
        archivedAt: props.archivedAt,
        updatedAt: props.updatedAt,
        createdAt: props.createdAt,
      },
      { upsert: true, new: true },
    );

    const messageDocs = props.messages.map((m) => ({
      _id: m.id.value,
      conversationId: m.conversationId,
      externalId: m.externalId,
      role: m.role,
      content: m.content,
      contentType: m.contentType,
      mediaUrl: m.mediaUrl,
      mimeType: m.mimeType,
      fileName: m.fileName,
      caption: m.caption,
      status: m.status,
      timestamp: m.timestamp,
      deliveredAt: m.deliveredAt,
      readAt: m.readAt,
      metadata: m.metadata,
    }));

    if (messageDocs.length > 0) {
      await MessageModel.bulkWrite(
        messageDocs.map((doc) => {
          const {
            externalId,
            contentType,
            mediaUrl,
            mimeType,
            fileName,
            caption,
            deliveredAt,
            readAt,
            metadata,
            ...required
          } = doc;
          const $set: Record<string, unknown> = { ...required, contentType: contentType ?? 'text' };
          if (externalId !== undefined) $set['externalId'] = externalId;
          if (mediaUrl !== undefined) $set['mediaUrl'] = mediaUrl;
          if (mimeType !== undefined) $set['mimeType'] = mimeType;
          if (fileName !== undefined) $set['fileName'] = fileName;
          if (caption !== undefined) $set['caption'] = caption;
          if (deliveredAt !== undefined) $set['deliveredAt'] = deliveredAt;
          if (readAt !== undefined) $set['readAt'] = readAt;
          if (metadata !== undefined) $set['metadata'] = metadata;
          return {
            updateOne: {
              filter: { _id: doc._id },
              update: { $set },
              upsert: true,
            },
          };
        }),
      );
    }

    return conversation;
  }

  async delete(id: string): Promise<void> {
    await Promise.all([
      ConversationModel.findByIdAndDelete(id),
      MessageModel.deleteMany({ conversationId: id }),
    ]);
  }

  private async loadMessages(conversationId: string): Promise<Message[]> {
    const docs = await MessageModel.find({ conversationId }).sort({ timestamp: 1 }).lean();
    return docs.map((d) =>
      Message.create({
        id: MessageId.from(String(d._id)),
        conversationId: d.conversationId,
        ...(d.externalId !== undefined && { externalId: d.externalId }),
        role: d.role,
        content: d.content,
        contentType: d.contentType ?? 'text',
        ...(d.mediaUrl !== undefined && { mediaUrl: d.mediaUrl }),
        ...(d.mimeType !== undefined && { mimeType: d.mimeType }),
        ...(d.fileName !== undefined && { fileName: d.fileName }),
        ...(d.caption !== undefined && { caption: d.caption }),
        status: d.status,
        timestamp: d.timestamp,
        ...(d.deliveredAt !== undefined && { deliveredAt: d.deliveredAt }),
        ...(d.readAt !== undefined && { readAt: d.readAt }),
        ...(d.metadata !== undefined && { metadata: d.metadata as Record<string, unknown> }),
      }),
    );
  }

  private toDomain(
    doc: Record<string, unknown>,
    messages: Message[],
  ): Conversation {
    const systemPrompt = doc['systemPrompt'] as string | undefined;
    return Conversation.create({
      id: String(doc['_id']),
      userId: doc['userId'] as string,
      phoneNumber: doc['phoneNumber'] as string,
      status: doc['status'] as 'active' | 'idle' | 'closed',
      messages,
      ...(systemPrompt !== undefined && { systemPrompt }),
      mode: ((doc['mode'] as ConversationMode | undefined) ?? 'bot'),
      handoffState: ((doc['handoffState'] as HandoffState | undefined) ?? 'none'),
      consecutiveHandoffs: ((doc['consecutiveHandoffs'] as number | undefined) ?? 0),
      assignedAgentId: (doc['assignedAgentId'] as string | null | undefined) ?? null,
      handoffAt: (doc['handoffAt'] as Date | null | undefined) ?? null,
      handoffBy: (doc['handoffBy'] as HandoffBy | null | undefined) ?? null,
      lastUserMessageAt: (doc['lastUserMessageAt'] as Date | null | undefined) ?? null,
      lastAgentMessageAt: (doc['lastAgentMessageAt'] as Date | null | undefined) ?? null,
      unreadCountAgent: (doc['unreadCountAgent'] as number | undefined) ?? 0,
      careerId: (doc['careerId'] as string | null | undefined) ?? null,
      metaData: (doc['metaData'] as ConversationMetaData | null | undefined) ?? null,
      currentProgramName: (doc['currentProgramName'] as string | null | undefined) ?? null,
      labels: (doc['labels'] as string[] | undefined) ?? [],
      pinned: (doc['pinned'] as boolean | undefined) ?? false,
      archivedAt: (doc['archivedAt'] as Date | null | undefined) ?? null,
      createdAt: doc['createdAt'] as Date,
      updatedAt: doc['updatedAt'] as Date,
    });
  }
}
