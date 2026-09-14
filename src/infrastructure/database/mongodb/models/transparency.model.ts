import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface TransparencyDocumentEntry {
  name: string;
  url: string;
}

export interface ITransparencyDocument {
  _id: Types.ObjectId;
  id: string;
  name: string;
  description: string;
  icon: string;
  documents: TransparencyDocumentEntry[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TransparencyDocument = HydratedDocument<ITransparencyDocument>;

const transparencyDocEntrySchema = new Schema<TransparencyDocumentEntry>(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const transparencySchema = new Schema<ITransparencyDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    icon: { type: String, trim: true, default: '' },
    documents: { type: [transparencyDocEntrySchema], default: [] },
    userId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'transparencies',
  },
);

export const TransparencyModel = model<ITransparencyDocument>('Transparency', transparencySchema);
