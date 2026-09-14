import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { getPrismaClient } from '../prisma.client.js';

export type FunnelUserStage =
  | 'AWARENESS'
  | 'CONSIDERATION'
  | 'DECISION'
  | 'HANDOFF'
  | 'CLOSED';

export type UserCategory =
  | 'first_contact'
  | 'interested'
  | 'ready_to_buy'
  | 'not_interested'
  | 'unknown';

export interface FunnelUserData {
  id: string;
  senderId: string;
  name?: string;
  platform: string;
  stage: FunnelUserStage;
  userCategory: UserCategory;
  assignedAgent?: string | null;
  currentFunnelId?: string | null;
  session: Record<string, unknown>;
}

const CATEGORY_TO_STAGE: Record<string, FunnelUserStage> = {
  first_contact: 'AWARENESS',
  interested: 'CONSIDERATION',
  ready_to_buy: 'DECISION',
  not_interested: 'CLOSED',
};

/**
 * Persists WhatsApp leads in chat_funnel_users so the admin panel can display them.
 */
export class FunnelUserPrismaRepository {
  private readonly prisma = getPrismaClient();

  private normalizeSenderId(senderId: string): string {
    return senderId.trim().replace(/^\+/, '');
  }

  async upsert(params: {
    senderId: string;
    name?: string;
    stage?: FunnelUserStage;
    userCategory?: UserCategory;
    assignedAgent?: string | null;
    sessionPatch?: Record<string, unknown>;
  }): Promise<string> {
    const senderId = this.normalizeSenderId(params.senderId);
    const name = params.name?.trim() || undefined;

    const existing = await this.prisma.chatFunnelUser.findFirst({
      where: {
        OR: [{ senderId }, { senderId: `+${senderId}` }],
      },
    });

    if (existing) {
      const currentSession = (existing.session ?? {}) as Record<string, unknown>;
      const session = params.sessionPatch
        ? { ...currentSession, ...params.sessionPatch }
        : currentSession;

      await this.prisma.chatFunnelUser.update({
        where: { id: existing.id },
        data: {
          senderId,
          ...(name ? { name } : {}),
          ...(params.stage ? { stage: params.stage } : {}),
          ...(params.userCategory ? { userCategory: params.userCategory } : {}),
          ...(params.assignedAgent !== undefined ? { assignedAgent: params.assignedAgent } : {}),
          session: session as Prisma.InputJsonValue,
        },
      });
      return existing.id;
    }

    const id = randomUUID();
    const stage = params.stage ?? 'AWARENESS';
    const userCategory = params.userCategory ?? 'first_contact';

    await this.prisma.chatFunnelUser.create({
      data: {
        id,
        senderId,
        name: name ?? null,
        platform: 'whatsapp',
        showTerms: false,
        stage,
        userCategory,
        campaignId: null,
        adId: null,
        utmSource: null,
        currentFunnelId: null,
        assignedAgent: params.assignedAgent ?? null,
        session: (params.sessionPatch ?? {}) as Prisma.InputJsonValue,
      },
    });

    return id;
  }

  async updateById(params: {
    id: string;
    stage?: FunnelUserStage;
    userCategory?: UserCategory;
    assignedAgent?: string | null;
  }): Promise<void> {
    await this.prisma.chatFunnelUser.update({
      where: { id: params.id },
      data: {
        ...(params.stage ? { stage: params.stage } : {}),
        ...(params.userCategory ? { userCategory: params.userCategory } : {}),
        ...(params.assignedAgent !== undefined ? { assignedAgent: params.assignedAgent } : {}),
      },
    });
  }

  async findBySenderId(senderId: string): Promise<FunnelUserData | null> {
    const normalized = this.normalizeSenderId(senderId);
    const doc = await this.prisma.chatFunnelUser.findFirst({
      where: {
        OR: [{ senderId: normalized }, { senderId: `+${normalized}` }],
      },
    });
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findForAdminInbox(opts: {
    since: Date;
    limit: number;
    offset: number;
  }): Promise<Array<FunnelUserData & { updatedAt: Date; createdAt: Date }>> {
    const docs = await this.prisma.chatFunnelUser.findMany({
      where: {
        platform: 'whatsapp',
        OR: [{ updatedAt: { gte: opts.since } }, { createdAt: { gte: opts.since } }],
      },
      orderBy: { updatedAt: 'desc' },
      skip: opts.offset,
      take: opts.limit,
    });

    return docs.map((doc) => ({
      ...this.toDomain(doc),
      updatedAt: doc.updatedAt,
      createdAt: doc.createdAt,
    }));
  }

  async countForAdminInbox(since: Date): Promise<number> {
    return this.prisma.chatFunnelUser.count({
      where: {
        platform: 'whatsapp',
        OR: [{ updatedAt: { gte: since } }, { createdAt: { gte: since } }],
      },
    });
  }

  async findSenderIdsByNameQuery(query: string): Promise<string[]> {
    const term = query.trim();
    if (!term) return [];

    const docs = await this.prisma.chatFunnelUser.findMany({
      where: {
        name: { contains: term, mode: 'insensitive' },
      },
      select: { senderId: true },
    });

    const variants = new Set<string>();
    for (const doc of docs) {
      const normalized = this.normalizeSenderId(doc.senderId);
      variants.add(normalized);
      variants.add(`+${normalized}`);
    }
    return [...variants];
  }

  async findNamesBySenderIds(senderIds: string[]): Promise<Map<string, string>> {
    if (senderIds.length === 0) return new Map();

    const variants = new Set<string>();
    for (const id of senderIds) {
      const normalized = this.normalizeSenderId(id);
      variants.add(normalized);
      variants.add(`+${normalized}`);
    }

    const docs = await this.prisma.chatFunnelUser.findMany({
      where: {
        senderId: { in: [...variants] },
        name: { not: null },
      },
      select: { senderId: true, name: true },
    });

    const map = new Map<string, string>();
    for (const doc of docs) {
      const key = this.normalizeSenderId(doc.senderId);
      const name = String(doc.name ?? '').trim();
      if (name) map.set(key, name);
    }
    return map;
  }

  async stageFromCategory(purchaseCategory: string): Promise<FunnelUserStage> {
    return CATEGORY_TO_STAGE[purchaseCategory] ?? 'AWARENESS';
  }

  private toDomain(doc: {
    id: string;
    senderId: string;
    name: string | null;
    platform: string;
    stage: string;
    userCategory: string;
    assignedAgent: string | null;
    currentFunnelId: string | null;
    session: unknown;
  }): FunnelUserData {
    const result: FunnelUserData = {
      id: doc.id,
      senderId: doc.senderId,
      platform: doc.platform,
      stage: doc.stage as FunnelUserStage,
      userCategory: doc.userCategory as UserCategory,
      session: (doc.session ?? {}) as Record<string, unknown>,
    };
    if (doc.name) result.name = doc.name;
    if (doc.assignedAgent !== undefined) result.assignedAgent = doc.assignedAgent;
    if (doc.currentFunnelId !== undefined) result.currentFunnelId = doc.currentFunnelId;
    return result;
  }
}
