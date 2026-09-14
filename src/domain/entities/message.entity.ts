import { MessageId } from '../value-objects/message-id.vo.js';

export type MessageRole = 'user' | 'assistant' | 'system' | 'agent' | 'internal';
export type MessageStatus = 'received' | 'processing' | 'sent' | 'delivered' | 'failed' | 'read';
export type MessageContentType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'interactive';

const STATUS_RANK: Record<MessageStatus, number> = {
  received: 0,
  processing: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: -1,
};

export interface MessageProps {
  id: MessageId;
  conversationId: string;
  externalId?: string;
  role: MessageRole;
  content: string;
  contentType?: MessageContentType;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  status: MessageStatus;
  timestamp: Date;
  deliveredAt?: Date;
  readAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Domain entity representing a message within a conversation.
 *
 * WhatsApp-style receipt mapping (admin UI):
 * - sent      → ✓
 * - delivered → ✓✓ gray
 * - read      → ✓✓ blue
 */
export class Message {
  readonly id: MessageId;
  readonly conversationId: string;
  readonly externalId: string | undefined;
  readonly role: MessageRole;
  readonly content: string;
  readonly contentType: MessageContentType;
  readonly mediaUrl: string | undefined;
  readonly mimeType: string | undefined;
  readonly fileName: string | undefined;
  readonly caption: string | undefined;
  readonly status: MessageStatus;
  readonly timestamp: Date;
  readonly deliveredAt: Date | undefined;
  readonly readAt: Date | undefined;
  readonly metadata: Record<string, unknown> | undefined;

  private constructor(props: MessageProps) {
    this.id = props.id;
    this.conversationId = props.conversationId;
    this.externalId = props.externalId;
    this.role = props.role;
    this.content = props.content;
    this.contentType = props.contentType ?? 'text';
    this.mediaUrl = props.mediaUrl;
    this.mimeType = props.mimeType;
    this.fileName = props.fileName;
    this.caption = props.caption;
    this.status = props.status;
    this.timestamp = props.timestamp;
    this.deliveredAt = props.deliveredAt;
    this.readAt = props.readAt;
    this.metadata = props.metadata;
  }

  static create(props: MessageProps): Message {
    const contentType = props.contentType ?? 'text';
    const isTextType = contentType === 'text';
    const isInternal = props.role === 'internal';
    // internal notes only require non-empty content (no media)
    if (isInternal) {
      if (!props.content.trim()) throw new Error('Note content cannot be empty');
      return new Message(props);
    }
    // text messages require non-empty content; media messages may have empty content (caption is optional)
    if (isTextType && !props.content.trim()) {
      throw new Error('Message content cannot be empty');
    }
    if (!isTextType && !props.content.trim() && !props.mediaUrl) {
      throw new Error('Media message must have either content or mediaUrl');
    }
    return new Message(props);
  }

  markAs(status: MessageStatus): Message {
    return Message.create({ ...this.toProps(), status });
  }

  withExternalId(externalId: string): Message {
    return new Message({ ...this.toProps(), externalId });
  }

  /**
   * Apply Meta webhook status progression. Returns null if status would not advance.
   */
  applyStatusUpdate(
    status: 'sent' | 'delivered' | 'read' | 'failed',
    timestamp: Date,
  ): Message | null {
    if (status === 'failed') {
      return new Message({ ...this.toProps(), status: 'failed' });
    }

    const domainStatus: MessageStatus = status;
    const currentRank = STATUS_RANK[this.status] ?? 0;
    const newRank = STATUS_RANK[domainStatus] ?? 0;
    if (newRank <= currentRank) {
      return null;
    }

    const props = this.toProps();
    if (domainStatus === 'delivered') {
      return new Message({ ...props, status: 'delivered', deliveredAt: timestamp });
    }
    if (domainStatus === 'read') {
      return new Message({
        ...props,
        status: 'read',
        readAt: timestamp,
        deliveredAt: props.deliveredAt ?? timestamp,
      });
    }
    return new Message({ ...props, status: domainStatus });
  }

  isFromUser(): boolean {
    return this.role === 'user';
  }

  isFromAssistant(): boolean {
    return this.role === 'assistant';
  }

  isFromAgent(): boolean {
    return this.role === 'agent';
  }

  toProps(): MessageProps {
    return {
      id: this.id,
      conversationId: this.conversationId,
      ...(this.externalId !== undefined && { externalId: this.externalId }),
      role: this.role,
      content: this.content,
      contentType: this.contentType,
      ...(this.mediaUrl !== undefined && { mediaUrl: this.mediaUrl }),
      ...(this.mimeType !== undefined && { mimeType: this.mimeType }),
      ...(this.fileName !== undefined && { fileName: this.fileName }),
      ...(this.caption !== undefined && { caption: this.caption }),
      status: this.status,
      timestamp: this.timestamp,
      ...(this.deliveredAt !== undefined && { deliveredAt: this.deliveredAt }),
      ...(this.readAt !== undefined && { readAt: this.readAt }),
      ...(this.metadata !== undefined && { metadata: this.metadata }),
    };
  }
}
