import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/**
 * Scheduled tasks for the SQS pipeline (user re-engagement, WhatsApp follow-ups, etc.).
 */
export interface ISqsScheduledTaskDocument {
  _id: Types.ObjectId;
  userId: string;
  abTestId: string | null;
  careerId: string | null;
  expiresAt: Date;
  funnelId: string;
  isPending: boolean;
  metaMessageId: string;
  originalMetaMessageId: string;
  platform: string;
  scheduledAt: Date;
  triggeringMessageId: string;
  userCategory: string;
  processedAt?: Date;
}

export type SqsScheduledTaskDocument = HydratedDocument<ISqsScheduledTaskDocument>;

const sqsScheduledTaskSchema = new Schema<ISqsScheduledTaskDocument>(
  {
    userId: { type: String, required: true, index: true },
    abTestId: { type: String, default: null },
    careerId: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    funnelId: { type: String, required: true, index: true },
    isPending: { type: Boolean, default: true, index: true },
    metaMessageId: { type: String, required: true },
    originalMetaMessageId: { type: String, required: true },
    platform: { type: String, required: true, trim: true },
    scheduledAt: { type: Date, required: true, index: true },
    triggeringMessageId: { type: String, required: true },
    userCategory: { type: String, required: true, trim: true },
    processedAt: { type: Date },
  },
  {
    versionKey: false,
    collection: 'sqs_scheduled_task',
  },
);

sqsScheduledTaskSchema.index({ isPending: 1, scheduledAt: 1 });

export const SqsScheduledTaskModel = model<ISqsScheduledTaskDocument>(
  'SqsScheduledTask',
  sqsScheduledTaskSchema,
);
