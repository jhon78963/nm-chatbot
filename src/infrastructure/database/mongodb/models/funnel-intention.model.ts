import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface IFunnelIntentionDocument {
  _id: Types.ObjectId;
  id: string;
  userId: string;
  title: string;
  type: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type FunnelIntentionDocument = HydratedDocument<IFunnelIntentionDocument>;

const funnelIntentionSchema = new Schema<IFunnelIntentionDocument>(
  {
    id: {
      type: String,
      required: [true, 'Funnel intention id is required'],
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: [true, 'userId is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'type is required'],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'funnel_intentions',
  },
);

funnelIntentionSchema.index({ type: 1, active: 1 });

export const FunnelIntentionModel = model<IFunnelIntentionDocument>(
  'FunnelIntention',
  funnelIntentionSchema,
);
