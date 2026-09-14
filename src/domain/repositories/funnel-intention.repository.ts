import type { FunnelIntention } from '../entities/funnel-intention.entity.js';

/**
 * Persistence port for FunnelIntention aggregate roots.
 */
export interface FunnelIntentionRepository {
  findById(id: string): Promise<FunnelIntention | null>;
  findByType(type: string): Promise<FunnelIntention | null>;
  findAll(): Promise<FunnelIntention[]>;
  findActive(): Promise<FunnelIntention[]>;
  save(funnelIntention: FunnelIntention): Promise<FunnelIntention>;
  saveBatch(funnelIntentions: FunnelIntention[]): Promise<FunnelIntention[]>;
  delete(id: string): Promise<void>;
}
