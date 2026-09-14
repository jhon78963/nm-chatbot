import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export type FunnelMessageRole = 'user' | 'bot' | 'agent';
export type FunnelMessageDirection = 'inbound' | 'outbound';

export type FunnelMessageContentType = 'text' | 'image' | 'document' | 'audio' | 'video';

export interface IFunnelMessageDocument {
  _id: Types.ObjectId;
  id: string;
  userId: string;
  text: string;
  role: FunnelMessageRole;
  timestamp: Date;
  platform: string;
  direction: FunnelMessageDirection;
  isAnswered: boolean;
  agentId?: string;
  contentType?: FunnelMessageContentType;
  mediaUrl?: string;
}

export type FunnelMessageDocument = HydratedDocument<IFunnelMessageDocument>;

const funnelMessageSchema = new Schema<IFunnelMessageDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true },
    role: {
      type: String,
      enum: ['user', 'bot', 'agent'] satisfies FunnelMessageRole[],
      required: true,
      index: true,
    },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    platform: { type: String, required: true, trim: true, index: true },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'] satisfies FunnelMessageDirection[],
      required: true,
    },
    isAnswered: { type: Boolean, default: false },
    agentId: { type: String, default: null, index: true },
    contentType: {
      type: String,
      enum: ['text', 'image', 'document', 'audio', 'video'] satisfies FunnelMessageContentType[],
      default: null,
    },
    mediaUrl: { type: String, default: null },
  },
  {
    versionKey: false,
    collection: 'funnel_messages',
  },
);

funnelMessageSchema.index({ userId: 1, timestamp: -1 });

export const FunnelMessageModel = model<IFunnelMessageDocument>('FunnelMessage', funnelMessageSchema);
