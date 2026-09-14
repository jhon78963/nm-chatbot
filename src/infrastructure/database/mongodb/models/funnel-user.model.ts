import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface IFunnelUserDocument {
  _id: Types.ObjectId;
  id: string;
  senderId: string;
  name?: string;
  platform: string;
  showTerms: boolean;
  stage: string;
  userCategory: string;
  campaignId: string | null;
  adId: string | null;
  utm_source: string | null;
  currentFunnelId: string | null;
  currentAbTestId: string | null;
  assignedAgent?: string | null;
  session: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type FunnelUserDocument = HydratedDocument<IFunnelUserDocument>;

const funnelUserSchema = new Schema<IFunnelUserDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    senderId: { type: String, required: true, unique: true, index: true },
    name: { type: String, trim: true },
    platform: { type: String, required: true, trim: true, index: true },
    showTerms: { type: Boolean, default: false },
    stage: { type: String, required: true, trim: true, index: true },
    userCategory: { type: String, required: true, trim: true, index: true },
    campaignId: { type: String, default: null },
    adId: { type: String, default: null },
    utm_source: { type: String, default: null },
    currentFunnelId: { type: String, default: null, index: true },
    currentAbTestId: { type: String, default: null },
    assignedAgent: { type: String, default: null, index: true },
    session: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'funnel_users',
  },
);

export const FunnelUserModel = model<IFunnelUserDocument>('FunnelUser', funnelUserSchema);
