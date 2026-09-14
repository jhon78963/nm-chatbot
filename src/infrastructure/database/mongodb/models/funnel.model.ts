import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface FunnelAgentEntry {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  status: 'Active' | 'Inactive';
}

export interface IFunnelDocument {
  _id: Types.ObjectId;
  id: string;
  name: string;
  description: string;
  funnelType: string;
  matchKeywords: string[];
  isDefault: boolean;
  agents: FunnelAgentEntry[];
  stages: unknown[];
  active: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FunnelDocument = HydratedDocument<IFunnelDocument>;

const funnelAgentEntrySchema = new Schema<FunnelAgentEntry>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    whatsapp: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], required: true },
  },
  { _id: false },
);

const funnelSchema = new Schema<IFunnelDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    funnelType: { type: String, required: true, trim: true, index: true },
    matchKeywords: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false, index: true },
    agents: { type: [funnelAgentEntrySchema], default: [] },
    stages: { type: [Schema.Types.Mixed], default: [] },
    active: { type: Boolean, default: true, index: true },
    userId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'funnels',
  },
);

export const FunnelModel = model<IFunnelDocument>('Funnel', funnelSchema);
