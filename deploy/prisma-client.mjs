/**
 * Shared Prisma client for deploy scripts (uses DATABASE_URL from .env).
 */
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
