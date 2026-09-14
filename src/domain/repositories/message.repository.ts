import type { Message } from '../entities/message.entity.js';
import type { MessageId } from '../value-objects/message-id.vo.js';

export interface MessageRepository {
  findById(id: MessageId): Promise<Message | null>;
  findByExternalId(externalId: string): Promise<Message | null>;
  findByConversationId(conversationId: string): Promise<Message[]>;
  save(message: Message): Promise<Message>;
  saveBatch(messages: Message[]): Promise<Message[]>;
}
