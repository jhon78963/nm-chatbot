import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/**
 * Pre-processed program text used for semantic search and RAG prompt enrichment.
 */
export interface IContextSourceDataDocument {
  _id: Types.ObjectId;
  original_id: string;
  full_text_content: string;
  program_name: string;
  updated_at: Date;
}

export type ContextSourceDataDocument = HydratedDocument<IContextSourceDataDocument>;

const contextSourceDataSchema = new Schema<IContextSourceDataDocument>(
  {
    original_id: { type: String, required: true, unique: true, index: true },
    full_text_content: { type: String, required: true },
    program_name: { type: String, required: true, trim: true, index: true },
    updated_at: { type: Date, required: true, default: Date.now },
  },
  {
    versionKey: false,
    collection: 'context_source_data',
  },
);

contextSourceDataSchema.index(
  { full_text_content: 'text', program_name: 'text' },
  { name: 'text_search', weights: { program_name: 10, full_text_content: 1 } },
);

export const ContextSourceDataModel = model<IContextSourceDataDocument>(
  'ContextSourceData',
  contextSourceDataSchema,
);
