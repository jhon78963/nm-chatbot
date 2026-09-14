import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface MediaDimensions {
  width: number;
  height: number;
}

export interface IMediaDocument {
  _id: Types.ObjectId;
  id: string;
  key: string;
  url: string;
  type: string;
  size: number;
  dimensions?: MediaDimensions;
  createdBy: string;
  createdAt: Date;
}

export type MediaDocument = HydratedDocument<IMediaDocument>;

const mediaDimensionsSchema = new Schema<MediaDimensions>(
  {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false },
);

const mediaSchema = new Schema<IMediaDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    key: { type: String, required: true, unique: true, trim: true },
    url: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true, index: true },
    size: { type: Number, required: true },
    dimensions: { type: mediaDimensionsSchema },
    createdBy: { type: String, required: true, index: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: 'medias',
  },
);

export const MediaModel = model<IMediaDocument>('Media', mediaSchema);
