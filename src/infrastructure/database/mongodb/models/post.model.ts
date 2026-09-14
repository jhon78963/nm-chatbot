import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type PostType = 'BLOG' | 'NEWS' | 'EVENT';

export interface IPostDocument {
  _id: Types.ObjectId;
  id: string;
  title: string;
  type: PostType;
  summary: string;
  slug: string;
  author: string;
  coverImageUrl: string;
  content: Record<string, unknown>;
  status: PostStatus;
  category: string;
  tags: string[];
  readTime: number;
  date: Date;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PostDocument = HydratedDocument<IPostDocument>;

const postSchema = new Schema<IPostDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['BLOG', 'NEWS', 'EVENT'] satisfies PostType[],
      required: true,
      index: true,
    },
    summary: { type: String, trim: true, default: '' },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    author: { type: String, required: true, index: true },
    coverImageUrl: { type: String, trim: true, default: '' },
    content: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] satisfies PostStatus[],
      required: true,
      default: 'DRAFT',
      index: true,
    },
    category: { type: String, trim: true, default: '', index: true },
    tags: { type: [String], default: [], index: true },
    readTime: { type: Number, default: 0 },
    date: { type: Date, required: true, index: true },
    userId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'posts',
  },
);

postSchema.index({ title: 'text', summary: 'text' }, { name: 'text_search' });

export const PostModel = model<IPostDocument>('Post', postSchema);
