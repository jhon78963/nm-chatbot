import type { Prisma } from '@prisma/client';
import type { MessageRepository } from '../../../../domain/repositories/message.repository.js';
import { Message } from '../../../../domain/entities/message.entity.js';
import { MessageId } from '../../../../domain/value-objects/message-id.vo.js';
import { getPrismaClient } from '../prisma.client.js';

export class MessagePrismaRepository implements MessageRepository {
  private readonly prisma = getPrismaClient();

  async findById(id: MessageId): Promise<Message | null> {
    const doc = await this.prisma.chatMessage.findUnique({ where: { id: id.value } });
    return doc ? this.toDomain(doc) : null;
  }

  async findByExternalId(externalId: string): Promise<Message | null> {
    const doc = await this.prisma.chatMessage.findUnique({ where: { externalId } });
    return doc ? this.toDomain(doc) : null;
  }

  async findByConversationId(conversationId: string): Promise<Message[]> {
    const docs = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'asc' },
    });
    return docs.map((d) => this.toDomain(d));
  }

  async save(message: Message): Promise<Message> {
    const props = message.toProps();
    await this.prisma.chatMessage.upsert({
      where: { id: props.id.value },
      create: this.toCreateInput(props),
      update: this.toUpdateInput(props),
    });
    return message;
  }

  async saveBatch(messages: Message[]): Promise<Message[]> {
    if (messages.length === 0) return [];

    await this.prisma.$transaction(
      messages.map((message) => {
        const props = message.toProps();
        return this.prisma.chatMessage.upsert({
          where: { id: props.id.value },
          create: this.toCreateInput(props),
          update: this.toUpdateInput(props),
        });
      }),
    );

    return messages;
  }

  private toCreateInput(props: ReturnType<Message['toProps']>): Prisma.ChatMessageCreateInput {
    return {
      id: props.id.value,
      conversation: { connect: { id: props.conversationId } },
      externalId: props.externalId ?? null,
      role: props.role,
      content: props.content,
      contentType: props.contentType ?? 'text',
      mediaUrl: props.mediaUrl ?? null,
      mimeType: props.mimeType ?? null,
      fileName: props.fileName ?? null,
      caption: props.caption ?? null,
      status: props.status,
      timestamp: props.timestamp,
      deliveredAt: props.deliveredAt ?? null,
      readAt: props.readAt ?? null,
      ...(props.metadata !== undefined
        ? { metadata: props.metadata as Prisma.InputJsonValue }
        : {}),
    };
  }

  private toUpdateInput(props: ReturnType<Message['toProps']>): Prisma.ChatMessageUpdateInput {
    return {
      role: props.role,
      content: props.content,
      contentType: props.contentType ?? 'text',
      externalId: props.externalId ?? null,
      mediaUrl: props.mediaUrl ?? null,
      mimeType: props.mimeType ?? null,
      fileName: props.fileName ?? null,
      caption: props.caption ?? null,
      status: props.status,
      timestamp: props.timestamp,
      deliveredAt: props.deliveredAt ?? null,
      readAt: props.readAt ?? null,
      ...(props.metadata !== undefined
        ? { metadata: props.metadata as Prisma.InputJsonValue }
        : {}),
    };
  }

  private toDomain(doc: {
    id: string;
    conversationId: string;
    externalId: string | null;
    role: string;
    content: string;
    contentType: string;
    mediaUrl: string | null;
    mimeType: string | null;
    fileName: string | null;
    caption: string | null;
    status: string;
    timestamp: Date;
    deliveredAt: Date | null;
    readAt: Date | null;
    metadata: unknown;
  }): Message {
    return Message.create({
      id: MessageId.from(doc.id),
      conversationId: doc.conversationId,
      ...(doc.externalId !== null && doc.externalId !== undefined && { externalId: doc.externalId }),
      role: doc.role as Message['role'],
      content: doc.content,
      contentType: (doc.contentType as Message['contentType']) ?? 'text',
      ...(doc.mediaUrl !== null && doc.mediaUrl !== undefined && { mediaUrl: doc.mediaUrl }),
      ...(doc.mimeType !== null && doc.mimeType !== undefined && { mimeType: doc.mimeType }),
      ...(doc.fileName !== null && doc.fileName !== undefined && { fileName: doc.fileName }),
      ...(doc.caption !== null && doc.caption !== undefined && { caption: doc.caption }),
      status: doc.status as Message['status'],
      timestamp: doc.timestamp,
      ...(doc.deliveredAt !== null && doc.deliveredAt !== undefined && { deliveredAt: doc.deliveredAt }),
      ...(doc.readAt !== null && doc.readAt !== undefined && { readAt: doc.readAt }),
      ...(doc.metadata !== null &&
        doc.metadata !== undefined && { metadata: doc.metadata as Record<string, unknown> }),
    });
  }
}
