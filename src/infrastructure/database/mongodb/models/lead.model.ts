import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface ILeadDocument {
  _id: Types.ObjectId;
  id: string;
  documentType: string;
  document: string;
  name: string;
  motherLastName: string;
  fatherLastName: string;
  whatsapp: string;
  email: string;
  programType: string;
  modality: string;
  programId: string;
  source: string;
  platform: string;
  createdAt: Date;
  updatedAt: Date;
}

export type LeadDocument = HydratedDocument<ILeadDocument>;

const leadSchema = new Schema<ILeadDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    documentType: { type: String, required: true, trim: true },
    document: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    motherLastName: { type: String, trim: true, default: '' },
    fatherLastName: { type: String, trim: true, default: '' },
    whatsapp: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    programType: { type: String, required: true, trim: true, index: true },
    modality: { type: String, required: true, trim: true, index: true },
    programId: { type: String, required: true, index: true },
    source: { type: String, required: true, trim: true, index: true },
    platform: { type: String, required: true, trim: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'leads',
  },
);

export const LeadModel = model<ILeadDocument>('Lead', leadSchema);
