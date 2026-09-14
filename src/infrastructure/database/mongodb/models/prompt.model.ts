import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import type { PromptVariableEntry } from '../../../../domain/entities/prompt.entity.js';

export type { PromptVariableEntry };

export interface IPromptDocument {
  _id: Types.ObjectId;
  id: string;
  title: string;
  active: boolean;
  funnelId: string;
  intentionId: string;
  template: string;
  variables: PromptVariableEntry[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PromptDocument = HydratedDocument<IPromptDocument>;

const promptVariableEntrySchema = new Schema<PromptVariableEntry>(
  {
    source: { type: String, required: true, trim: true },
    path: { type: String, required: true, trim: true },
    collectionId: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const promptSchema = new Schema<IPromptDocument>(
  {
    id: {
      type: String,
      required: [true, 'Prompt id is required'],
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    funnelId: {
      type: String,
      required: [true, 'funnelId is required'],
      index: true,
    },
    intentionId: {
      type: String,
      required: [true, 'intentionId is required'],
      index: true,
    },
    template: {
      type: String,
      required: [true, 'Prompt template is required'],
      trim: true,
    },
    variables: {
      type: [promptVariableEntrySchema],
      default: [],
    },
    userId: {
      type: String,
      required: [true, 'userId is required'],
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'prompts',
  },
);

promptSchema.index(
  { funnelId: 1, intentionId: 1, active: 1 },
  {
    name: 'unique_active_prompt',
    partialFilterExpression: { active: true },
  },
);

export const PromptModel = model<IPromptDocument>('Prompt', promptSchema);
