import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface WorkerSocialLink {
  platform: string;
  url: string;
}

export interface IWorkerDocument {
  _id: Types.ObjectId;
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string;
  photoUrl: string;
  department: string;
  biography: string;
  isVisible: boolean;
  socialLinks: WorkerSocialLink[];
  roles: string[];
  order: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkerDocument = HydratedDocument<IWorkerDocument>;

const workerSocialLinkSchema = new Schema<WorkerSocialLink>(
  {
    platform: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const workerSchema = new Schema<IWorkerDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true, default: '' },
    photoUrl: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '', index: true },
    biography: { type: String, trim: true, default: '' },
    isVisible: { type: Boolean, default: true, index: true },
    socialLinks: { type: [workerSocialLinkSchema], default: [] },
    roles: { type: [String], default: [], index: true },
    order: { type: Number, default: 0 },
    userId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'workers',
  },
);

export const WorkerModel = model<IWorkerDocument>('Worker', workerSchema);
