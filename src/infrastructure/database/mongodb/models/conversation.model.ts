import { Schema, model, type Document } from 'mongoose';

export type ConversationStatus = 'active' | 'idle' | 'closed';
export type HandoffState = 'none' | 'pending' | 'confirmed';
export type ConversationMode = 'bot' | 'human';
export type HandoffBy = 'user' | 'bot' | 'agent' | 'system';

export interface ConversationDocument extends Document<string> {
  userId: string;
  phoneNumber: string;
  status: ConversationStatus;
  systemPrompt?: string;
  mode: ConversationMode;
  handoffState: HandoffState;
  consecutiveHandoffs: number;
  assignedAgentId: string | null;
  handoffAt: Date | null;
  handoffBy: HandoffBy | null;
  lastUserMessageAt: Date | null;
  lastAgentMessageAt: Date | null;
  unreadCountAgent: number;
  careerId: string | null;
  metaData: { filterType: string | null; filterValue: string | string[] } | null;
  currentProgramName: string | null;
  labels: string[];
  pinned: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDocument>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    phoneNumber: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'idle', 'closed'] satisfies ConversationStatus[],
      default: 'active',
      index: true,
    },
    systemPrompt: { type: String },
    mode: {
      type: String,
      enum: ['bot', 'human'] satisfies ConversationMode[],
      default: 'bot',
      index: true,
    },
    handoffState: {
      type: String,
      enum: ['none', 'pending', 'confirmed'] satisfies HandoffState[],
      default: 'none',
    },
    consecutiveHandoffs: { type: Number, default: 0 },
    assignedAgentId: { type: String, default: null, index: true },
    handoffAt: { type: Date, default: null },
    handoffBy: {
      type: String,
      enum: ['user', 'bot', 'agent', 'system'] satisfies HandoffBy[],
      default: null,
    },
    lastUserMessageAt: { type: Date, default: null },
    lastAgentMessageAt: { type: Date, default: null },
    unreadCountAgent: { type: Number, default: 0 },
    careerId: { type: String, default: null },
    metaData: {
      type: {
        filterType: { type: String, default: null },
        filterValue: { type: Schema.Types.Mixed, default: null },
      },
      default: null,
    },
    currentProgramName: { type: String, default: null },
    labels: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'conversations',
  },
);

conversationSchema.index({ phoneNumber: 1, status: 1 });
conversationSchema.index({ mode: 1, assignedAgentId: 1, status: 1 });
conversationSchema.index({ unreadCountAgent: 1 });
conversationSchema.index({ lastUserMessageAt: -1 });
conversationSchema.index({ mode: 1, status: 1, assignedAgentId: 1, unreadCountAgent: 1 });
conversationSchema.index({ labels: 1 });
conversationSchema.index({ pinned: -1, updatedAt: -1 });
conversationSchema.index({ archivedAt: 1 });

export const ConversationModel = model<ConversationDocument>('Conversation', conversationSchema);
