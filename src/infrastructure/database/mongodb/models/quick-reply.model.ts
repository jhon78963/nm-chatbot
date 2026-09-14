import { Schema, model, type Document } from 'mongoose';

export interface QuickReplyDocument extends Document<string> {
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const quickReplySchema = new Schema<QuickReplyDocument>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'quick_replies',
  },
);

quickReplySchema.index({ title: 1 });
quickReplySchema.index({ createdBy: 1 });

export const QuickReplyModel = model<QuickReplyDocument>('QuickReply', quickReplySchema);
