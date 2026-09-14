import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { ProgramType } from '../../../../domain/enums/program-type.enum.js';
import { Modality } from '../../../../domain/enums/modality.enum.js';
import type {
  ProgramCostEntry,
  ProgramFaqEntry,
  ProgramModalityEntry,
  ProgramStatus,
} from '../../../../domain/entities/program.entity.js';

export type { ProgramCostEntry, ProgramFaqEntry, ProgramModalityEntry, ProgramStatus };

export interface IProgramDocument {
  _id: Types.ObjectId;
  id: string;
  name: string;
  types: ProgramType[];
  facultyId: string;
  duration: string;
  modalities: ProgramModalityEntry[];
  academicDegree: string;
  professionalTitle: string;
  brochureUrl: string;
  summary: string;
  sellingPoints: string[];
  tags: string[];
  questionsAnswered: string[];
  faq: ProgramFaqEntry[];
  graduateProfile: string;
  jobOpportunities: string[];
  objective: string;
  coverImage: string;
  gallery: string[];
  promoVideoUrl: string;
  admissionRequirements: string[];
  whatsappContact: string;
  applicationFormUrl: string;
  thesisFolderFee: number;
  slug: string;
  status: ProgramStatus;
  directorId: string;
  teacherIds: string[];
  totalCredits: number;
  userId: string;
  searchText: string;
  scheduleDescription: string;
  bachelorFolderFee: number;
  costs: ProgramCostEntry[];
  iaInformation: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ProgramDocument = HydratedDocument<IProgramDocument>;

const programModalityEntrySchema = new Schema<ProgramModalityEntry>(
  {
    careerType: { type: String, required: true, trim: true },
    modalities: {
      type: [String],
      enum: Object.values(Modality),
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'Each career type must have at least one modality',
      },
    },
  },
  { _id: false },
);

const programFaqEntrySchema = new Schema<ProgramFaqEntry>(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const programCostEntrySchema = new Schema<ProgramCostEntry>(
  {
    currency: { type: String, required: true, trim: true },
    thesisFolderFee: { type: Number, required: true },
    bachelorFolderFee: { type: Number, required: true },
  },
  { _id: false },
);

const programSchema = new Schema<IProgramDocument>(
  {
    id: {
      type: String,
      required: [true, 'Program id is required'],
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Program name is required'],
      trim: true,
      index: true,
    },
    types: {
      type: [String],
      enum: Object.values(ProgramType),
      required: [true, 'At least one program type is required'],
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'Program must have at least one type',
      },
      index: true,
    },
    facultyId: {
      type: String,
      required: [true, 'facultyId is required'],
      index: true,
    },
    duration: {
      type: String,
      required: [true, 'Duration is required'],
      trim: true,
    },
    modalities: {
      type: [programModalityEntrySchema],
      required: [true, 'At least one modality is required'],
      validate: {
        validator: (v: ProgramModalityEntry[]) => v.length > 0,
        message: 'Program must have at least one modality',
      },
    },
    academicDegree: { type: String, required: true, trim: true },
    professionalTitle: { type: String, required: true, trim: true },
    brochureUrl: { type: String, trim: true, default: '' },
    summary: { type: String, required: true, trim: true },
    sellingPoints: { type: [String], default: [] },
    tags: { type: [String], default: [], index: true },
    questionsAnswered: { type: [String], default: [] },
    faq: { type: [programFaqEntrySchema], default: [] },
    graduateProfile: { type: String, required: true, trim: true },
    jobOpportunities: { type: [String], default: [] },
    objective: { type: String, required: true, trim: true },
    coverImage: { type: String, trim: true, default: '' },
    gallery: { type: [String], default: [] },
    promoVideoUrl: { type: String, trim: true, default: '' },
    admissionRequirements: { type: [String], default: [] },
    whatsappContact: {
      type: String,
      required: [true, 'WhatsApp number is required'],
      trim: true,
      validate: {
        validator: (v: string) => v === '' || /^\+[1-9]\d{7,14}$/.test(v),
        message: 'WhatsApp number must be in E.164 format',
      },
    },
    applicationFormUrl: { type: String, trim: true, default: '' },
    thesisFolderFee: { type: Number, default: 0 },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: [true, 'Status is required'],
      index: true,
    },
    directorId: { type: String, required: true, index: true },
    teacherIds: { type: [String], default: [] },
    totalCredits: { type: Number, default: 0 },
    userId: { type: String, required: true, index: true },
    searchText: { type: String, trim: true, default: '', index: true },
    scheduleDescription: { type: String, trim: true, default: '' },
    bachelorFolderFee: { type: Number, default: 0 },
    costs: { type: [programCostEntrySchema], default: [] },
    iaInformation: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'programs',
  },
);

programSchema.index(
  { name: 'text', summary: 'text', iaInformation: 'text', searchText: 'text' },
  { name: 'text_search', weights: { name: 10, summary: 5, iaInformation: 3, searchText: 8 } },
);

programSchema.index({ 'modalities.modalities': 1 });

export const ProgramModel = model<IProgramDocument>('Program', programSchema);
