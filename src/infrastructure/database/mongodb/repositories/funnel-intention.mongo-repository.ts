import type { FunnelIntentionRepository } from '../../../../domain/repositories/funnel-intention.repository.js';
import { FunnelIntention } from '../../../../domain/entities/funnel-intention.entity.js';
import { FunnelIntentionModel, type IFunnelIntentionDocument } from '../models/funnel-intention.model.js';
import type { FlattenMaps } from 'mongoose';

type LeanFunnelIntention = FlattenMaps<IFunnelIntentionDocument>;

export class FunnelIntentionMongoRepository implements FunnelIntentionRepository {
  async findById(id: string): Promise<FunnelIntention | null> {
    const doc = await FunnelIntentionModel.findOne({ id }).lean();
    return doc ? this.toDomain(doc as LeanFunnelIntention) : null;
  }

  async findByType(type: string): Promise<FunnelIntention | null> {
    const doc = await FunnelIntentionModel.findOne({ type, active: true }).lean();
    return doc ? this.toDomain(doc as LeanFunnelIntention) : null;
  }

  async findAll(): Promise<FunnelIntention[]> {
    const docs = await FunnelIntentionModel.find().lean();
    return (docs as LeanFunnelIntention[]).map((d) => this.toDomain(d));
  }

  async findActive(): Promise<FunnelIntention[]> {
    const docs = await FunnelIntentionModel.find({ active: true }).lean();
    return (docs as LeanFunnelIntention[]).map((d) => this.toDomain(d));
  }

  async save(funnelIntention: FunnelIntention): Promise<FunnelIntention> {
    const props = funnelIntention.toProps();
    await FunnelIntentionModel.findOneAndUpdate(
      { id: props.id },
      {
        id: props.id,
        userId: props.userId,
        title: props.title,
        type: props.type,
        description: props.description,
        active: props.active,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      { upsert: true, new: true },
    );
    return funnelIntention;
  }

  async saveBatch(funnelIntentions: FunnelIntention[]): Promise<FunnelIntention[]> {
    const ops = funnelIntentions.map((funnelIntention) => {
      const props = funnelIntention.toProps();
      return {
        updateOne: {
          filter: { type: props.type },
          update: {
            $setOnInsert: {
              id: props.id,
              userId: props.userId,
              title: props.title,
              type: props.type,
              description: props.description,
              active: props.active,
              createdAt: props.createdAt,
              updatedAt: props.updatedAt,
            },
          },
          upsert: true,
        },
      };
    });
    await FunnelIntentionModel.bulkWrite(ops);
    return funnelIntentions;
  }

  async delete(id: string): Promise<void> {
    await FunnelIntentionModel.deleteOne({ id });
  }

  private toDomain(doc: LeanFunnelIntention): FunnelIntention {
    return FunnelIntention.create({
      id: doc.id,
      userId: doc.userId,
      title: doc.title,
      type: doc.type,
      description: doc.description,
      active: doc.active,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }
}
