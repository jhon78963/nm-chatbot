import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface IBannerDocument {
  _id: Types.ObjectId;
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
  cta: string;
  path: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type BannerDocument = HydratedDocument<IBannerDocument>;

const bannerSchema = new Schema<IBannerDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    cta: { type: String, trim: true, default: '' },
    path: { type: String, trim: true, default: '' },
    userId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'banners',
  },
);

export const BannerModel = model<IBannerDocument>('Banner', bannerSchema);
