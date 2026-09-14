import { randomUUID } from 'crypto';
import { getPrismaClient } from '../prisma.client.js';

export interface QuickReplyDto {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class QuickReplyPrismaRepository {
  private readonly prisma = getPrismaClient();

  async findAll(): Promise<QuickReplyDto[]> {
    const docs = await this.prisma.chatQuickReply.findMany({ orderBy: { title: 'asc' } });
    return docs.map((doc) => this.toDto(doc));
  }

  async findById(id: string): Promise<QuickReplyDto | null> {
    const doc = await this.prisma.chatQuickReply.findUnique({ where: { id } });
    return doc ? this.toDto(doc) : null;
  }

  async create(data: { title: string; body: string; createdBy: string }): Promise<QuickReplyDto> {
    const doc = await this.prisma.chatQuickReply.create({
      data: {
        id: randomUUID(),
        title: data.title.trim(),
        body: data.body,
        createdBy: data.createdBy,
      },
    });
    return this.toDto(doc);
  }

  async update(id: string, data: { title?: string; body?: string }): Promise<QuickReplyDto | null> {
    const update: { title?: string; body?: string } = {};
    if (data.title !== undefined) update.title = data.title.trim();
    if (data.body !== undefined) update.body = data.body;

    try {
      const doc = await this.prisma.chatQuickReply.update({
        where: { id },
        data: update,
      });
      return this.toDto(doc);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.chatQuickReply.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  private toDto(doc: {
    id: string;
    title: string;
    body: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): QuickReplyDto {
    return {
      id: doc.id,
      title: doc.title,
      body: doc.body,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
