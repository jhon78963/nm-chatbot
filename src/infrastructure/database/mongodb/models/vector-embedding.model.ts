import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/**
 * Vector embedding index generated from context_source_data for semantic search.
 */
export interface IVectorEmbeddingDocument {
  _id: Types.ObjectId;
  original_id: string;
  embedding: number[];
  program_name: string;
  embedding_updated_at: Date;
}

export type VectorEmbeddingDocument = HydratedDocument<IVectorEmbeddingDocument>;

const vectorEmbeddingSchema = new Schema<IVectorEmbeddingDocument>(
  {
    original_id: { type: String, required: true, unique: true, index: true },
    embedding: { type: [Number], required: true },
    program_name: { type: String, required: true, trim: true, index: true },
    embedding_updated_at: { type: Date, required: true, default: Date.now },
  },
  {
    versionKey: false,
    collection: 'vector_embeddings_index',
  },
);

export const VectorEmbeddingModel = model<IVectorEmbeddingDocument>(
  'VectorEmbedding',
  vectorEmbeddingSchema,
);
