import { randomUUID } from 'node:crypto';
import {
  FunnelIntentionType,
  FunnelIntention,
} from '../../../../domain/entities/funnel-intention.entity.js';
import type { FunnelIntentionRepository } from '../../../../domain/repositories/funnel-intention.repository.js';

const LOCAL_DEV_USER_ID = '00000000-0000-0000-0000-000000000000';

export const FUNNEL_INTENTIONS_BASE: Array<
  Omit<ReturnType<FunnelIntention['toProps']>, 'id'> & { id: string }
> = [
  {
    id: randomUUID(),
    userId: LOCAL_DEV_USER_ID,
    title: 'Identify User Intent',
    type: FunnelIntentionType.IDENTIFY_NEED,
    description:
      'Default intention when the bot must analyze the message to determine the user goal.',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export async function seedFunnelIntentions(repo: FunnelIntentionRepository): Promise<void> {
  const funnelIntentions = FUNNEL_INTENTIONS_BASE.map((data) => FunnelIntention.create(data));
  await repo.saveBatch(funnelIntentions);
}
