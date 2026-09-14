import type { PromptRepository } from '../../../../domain/repositories/prompt.repository.js';
import { Prompt } from '../../../../domain/entities/prompt.entity.js';
import { PromptModel, type IPromptDocument } from '../models/prompt.model.js';
import type { FlattenMaps } from 'mongoose';

type LeanPrompt = FlattenMaps<IPromptDocument>;

export class PromptMongoRepository implements PromptRepository {
  async findById(id: string): Promise<Prompt | null> {
    const doc = await PromptModel.findOne({ id }).lean();
    return doc ? this.toDomain(doc as LeanPrompt) : null;
  }

  async findActiveByFunnelAndIntention(
    funnelId: string,
    intentionId: string,
  ): Promise<Prompt | null> {
    const doc = await PromptModel.findOne({
      funnelId,
      intentionId,
      active: true,
    }).lean();
    return doc ? this.toDomain(doc as LeanPrompt) : null;
  }

  async findByIntentionId(intentionId: string): Promise<Prompt[]> {
    const docs = await PromptModel.find({ intentionId }).lean();
    return (docs as LeanPrompt[]).map((d) => this.toDomain(d));
  }

  async findByFunnelId(funnelId: string): Promise<Prompt[]> {
    const docs = await PromptModel.find({ funnelId }).lean();
    return (docs as LeanPrompt[]).map((d) => this.toDomain(d));
  }

  async findActive(): Promise<Prompt[]> {
    const docs = await PromptModel.find({ active: true }).lean();
    return (docs as LeanPrompt[]).map((d) => this.toDomain(d));
  }

  async save(prompt: Prompt): Promise<Prompt> {
    const props = prompt.toProps();
    await PromptModel.findOneAndUpdate(
      { id: props.id },
      {
        id: props.id,
        title: props.title,
        active: props.active,
        funnelId: props.funnelId,
        intentionId: props.intentionId,
        template: props.template,
        variables: (props.variables ?? []).map((item) => ({ ...item })),
        userId: props.userId,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      { upsert: true, new: true },
    );
    return prompt;
  }

  async delete(id: string): Promise<void> {
    await PromptModel.deleteOne({ id });
  }

  private toDomain(doc: LeanPrompt): Prompt {
    return Prompt.create({
      id: doc.id,
      title: doc.title,
      active: doc.active,
      funnelId: doc.funnelId,
      intentionId: doc.intentionId,
      template: doc.template,
      variables: (doc.variables ?? []).map((item) => ({ ...item })),
      userId: doc.userId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }
}
