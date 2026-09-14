import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface ISubscriberDocument {
  _id: Types.ObjectId;
  type: string;
  email: string;
  status: boolean;
}

export type SubscriberDocument = HydratedDocument<ISubscriberDocument>;

const subscriberSchema = new Schema<ISubscriberDocument>(
  {
    type: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    status: { type: Boolean, default: true, index: true },
  },
  {
    versionKey: false,
    collection: 'subscriber',
  },
);

export const SubscriberModel = model<ISubscriberDocument>('Subscriber', subscriberSchema);
