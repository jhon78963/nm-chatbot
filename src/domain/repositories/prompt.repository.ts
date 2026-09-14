import type { Prompt } from '../entities/prompt.entity.js';

/**
 * Persistence port for Prompt aggregate roots.
 */
export interface PromptRepository {
  findById(id: string): Promise<Prompt | null>;
  findActiveByFunnelAndIntention(
    funnelId: string,
    intentionId: string,
  ): Promise<Prompt | null>;
  findByIntentionId(intentionId: string): Promise<Prompt[]>;
  findByFunnelId(funnelId: string): Promise<Prompt[]>;
  findActive(): Promise<Prompt[]>;
  save(prompt: Prompt): Promise<Prompt>;
  delete(id: string): Promise<void>;
}
