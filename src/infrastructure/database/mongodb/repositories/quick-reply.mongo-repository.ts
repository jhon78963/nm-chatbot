import { randomUUID } from 'crypto';
import { QuickReplyModel } from '../models/quick-reply.model.js';

export interface QuickReplyDto {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class QuickReplyMongoRepository {
  async findAll(): Promise<QuickReplyDto[]> {
    const docs = await QuickReplyModel.find().sort({ title: 1 }).lean();
    return docs.map(this.toDto);
  }

  async findById(id: string): Promise<QuickReplyDto | null> {
    const doc = await QuickReplyModel.findById(id).lean();
    return doc ? this.toDto(doc) : null;
  }

  async create(data: { title: string; body: string; createdBy: string }): Promise<QuickReplyDto> {
    const doc = await QuickReplyModel.create({
      _id: randomUUID(),
      title: data.title.trim(),
      body: data.body,
      createdBy: data.createdBy,
    });
    return this.toDto(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: { title?: string; body?: string }): Promise<QuickReplyDto | null> {
    const update: Record<string, string> = {};
    if (data.title !== undefined) update['title'] = data.title.trim();
    if (data.body !== undefined) update['body'] = data.body;

    const doc = await QuickReplyModel.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    return doc ? this.toDto(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await QuickReplyModel.findByIdAndDelete(id);
    return result !== null;
  }

  private toDto(doc: Record<string, unknown>): QuickReplyDto {
    return {
      id: String(doc['_id']),
      title: doc['title'] as string,
      body: doc['body'] as string,
      createdBy: doc['createdBy'] as string,
      createdAt: doc['createdAt'] as Date,
      updatedAt: doc['updatedAt'] as Date,
    };
  }
}
