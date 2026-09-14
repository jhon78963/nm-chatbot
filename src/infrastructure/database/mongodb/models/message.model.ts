import { Schema, model, type Document } from 'mongoose';

export type MessageRole = 'user' | 'assistant' | 'system' | 'agent' | 'internal';
export type MessageStatus = 'received' | 'processing' | 'sent' | 'delivered' | 'failed' | 'read';
export type MessageContentType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'interactive';

export interface MessageDocument extends Document<string> {
  conversationId: string;
  externalId?: string;
  role: MessageRole;
  content: string;
  contentType: MessageContentType;
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

const messageSchema = new Schema<MessageDocument>(
  {
    _id: { type: String, required: true },
    conversationId: { type: String, required: true, index: true },
    externalId: { type: String, sparse: true },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system', 'agent', 'internal'] satisfies MessageRole[],
      required: true,
    },
    content: { type: String, required: true },
    contentType: {
      type: String,
      enum: ['text', 'image', 'document', 'audio', 'video', 'location', 'interactive'] satisfies MessageContentType[],
      default: 'text',
    },
    mediaUrl: { type: String },
    mimeType: { type: String },
    fileName: { type: String },
    caption: { type: String },
    status: {
      type: String,
      enum: ['received', 'processing', 'sent', 'delivered', 'failed', 'read'] satisfies MessageStatus[],
      default: 'received',
    },
    timestamp: { type: Date, required: true, default: Date.now },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    versionKey: false,
    collection: 'messages',
  },
);

messageSchema.index({ conversationId: 1, timestamp: 1 });
messageSchema.index({ externalId: 1 }, { sparse: true });

export const MessageModel = model<MessageDocument>('Message', messageSchema);
