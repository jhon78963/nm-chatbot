import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface IFacultyDocument {
  _id: Types.ObjectId;
  id: string;
  name: string;
  description: string;
  image: string;
  decanoId: string;
  tags: string[];
  slug: string;
  type: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FacultyDocument = HydratedDocument<IFacultyDocument>;

const facultySchema = new Schema<IFacultyDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true, default: '' },
    image: { type: String, trim: true, default: '' },
    decanoId: { type: String, required: true, index: true },
    tags: { type: [String], default: [], index: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    type: { type: String, required: true, trim: true, index: true },
    userId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'faculties',
  },
);

export const FacultyModel = model<IFacultyDocument>('Faculty', facultySchema);
