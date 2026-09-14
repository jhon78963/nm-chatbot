import type { UserRepository } from '../../domain/repositories/user.repository.js';
import type { FunnelUserPrismaRepository } from '../database/prisma/repositories/funnel-user.prisma-repository.js';

/** Resolve lead display name from funnel_users (WhatsApp profile) or users collection. */
export async function resolveContactName(
  phoneNumber: string,
  userId: string | undefined,
  funnelUserRepo: FunnelUserPrismaRepository,
  userRepo: UserRepository,
): Promise<string | null> {
  const funnelUser = await funnelUserRepo.findBySenderId(phoneNumber);
  const funnelName = funnelUser?.name?.trim();
  if (funnelName) return funnelName;

  if (userId) {
    const names = await userRepo.findNamesByIds([userId]);
    const userName = names.get(userId)?.trim();
    if (userName) return userName;
  }

  return null;
}
