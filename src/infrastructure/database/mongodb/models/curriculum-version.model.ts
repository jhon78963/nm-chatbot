import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface CurriculumCourseEntry {
  title: string;
  credits: number;
}

export interface CurriculumCicleEntry {
  name: string;
  goal: string;
  content: CurriculumCourseEntry[];
}

export interface ICurriculumVersionDocument {
  _id: Types.ObjectId;
  id: string;
  careerId: string;
  description: string;
  version: string;
  cicle: CurriculumCicleEntry[];
  curriculumUrl: string;
  isActive: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CurriculumVersionDocument = HydratedDocument<ICurriculumVersionDocument>;

const curriculumCourseSchema = new Schema<CurriculumCourseEntry>(
  {
    title: { type: String, required: true, trim: true },
    credits: { type: Number, required: true },
  },
  { _id: false },
);

const curriculumCicleSchema = new Schema<CurriculumCicleEntry>(
  {
    name: { type: String, required: true, trim: true },
    goal: { type: String, trim: true, default: '' },
    content: { type: [curriculumCourseSchema], default: [] },
  },
  { _id: false },
);

const curriculumVersionSchema = new Schema<ICurriculumVersionDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    careerId: { type: String, required: true, index: true },
    description: { type: String, trim: true, default: '' },
    version: { type: String, required: true, trim: true },
    cicle: { type: [curriculumCicleSchema], default: [] },
    curriculumUrl: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    userId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'curriculum_versions',
  },
);

curriculumVersionSchema.index({ careerId: 1, isActive: 1 });

export const CurriculumVersionModel = model<ICurriculumVersionDocument>(
  'CurriculumVersion',
  curriculumVersionSchema,
);
