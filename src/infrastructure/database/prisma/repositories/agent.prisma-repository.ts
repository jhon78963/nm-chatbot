import type { AgentRepository } from '../../../../domain/repositories/agent.repository.js';
import { Agent } from '../../../../domain/entities/agent.entity.js';
import { getPrismaClient } from '../prisma.client.js';

export class AgentPrismaRepository implements AgentRepository {
  private readonly prisma = getPrismaClient();

  async findById(id: string): Promise<Agent | null> {
    const doc = await this.prisma.chatAgent.findUnique({ where: { id } });
    return doc ? this.toDomain(doc) : null;
  }

  async findAll(): Promise<Agent[]> {
    const docs = await this.prisma.chatAgent.findMany();
    return docs.map((d) => this.toDomain(d));
  }

  async findActive(): Promise<Agent[]> {
    const docs = await this.prisma.chatAgent.findMany({ where: { status: 'Active' } });
    return docs.map((d) => this.toDomain(d));
  }

  async findByUserId(userId: string): Promise<Agent[]> {
    const docs = await this.prisma.chatAgent.findMany({ where: { userId } });
    return docs.map((d) => this.toDomain(d));
  }

  async findByUsername(username: string): Promise<Agent | null> {
    const doc = await this.prisma.chatAgent.findUnique({
      where: { username: username.toLowerCase() },
    });
    return doc ? this.toDomain(doc) : null;
  }

  async findByEmail(email: string): Promise<Agent | null> {
    const doc = await this.prisma.chatAgent.findFirst({
      where: { email: email.toLowerCase().trim() },
    });
    return doc ? this.toDomain(doc) : null;
  }

  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const docs = await this.prisma.chatAgent.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(docs.map((d) => [d.id, d.name]));
  }

  async save(agent: Agent): Promise<Agent> {
    const props = agent.toProps();
    await this.prisma.chatAgent.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        name: props.name,
        email: props.email,
        whatsapp: props.whatsapp,
        status: props.status,
        userId: props.userId,
        username: props.username,
        lastLoginAt: props.lastLoginAt,
        role: props.role,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      update: {
        name: props.name,
        email: props.email,
        whatsapp: props.whatsapp,
        status: props.status,
        userId: props.userId,
        username: props.username,
        lastLoginAt: props.lastLoginAt,
        role: props.role,
        updatedAt: props.updatedAt,
      },
    });
    return agent;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.chatAgent.delete({ where: { id } });
  }

  async getPasswordHash(agentId: string): Promise<string | null> {
    const doc = await this.prisma.chatAgent.findUnique({
      where: { id: agentId },
      select: { passwordHash: true },
    });
    return doc?.passwordHash ?? null;
  }

  async updatePasswordHash(agentId: string, hash: string): Promise<void> {
    await this.prisma.chatAgent.update({
      where: { id: agentId },
      data: { passwordHash: hash },
    });
  }

  async updateLastLogin(agentId: string): Promise<void> {
    await this.prisma.chatAgent.update({
      where: { id: agentId },
      data: { lastLoginAt: new Date() },
    });
  }

  private normalizeWhatsapp(value: string): string {
    const trimmed = value.trim();
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  private toDomain(doc: {
    id: string;
    name: string;
    email: string;
    whatsapp: string;
    status: string;
    userId: string;
    username: string | null;
    lastLoginAt: Date | null;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  }): Agent {
    return Agent.create({
      id: doc.id,
      name: doc.name,
      email: doc.email,
      whatsapp: this.normalizeWhatsapp(doc.whatsapp),
      status: doc.status as 'Active' | 'Inactive',
      userId: doc.userId,
      username: doc.username ?? null,
      lastLoginAt: doc.lastLoginAt ?? null,
      role: (doc.role as 'agent' | 'admin' | undefined) ?? 'agent',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }
}
