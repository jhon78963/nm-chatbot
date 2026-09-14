import { PrismaClient } from '@prisma/client';
import { logger } from '../../shared/logger.js';

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function connectPrisma(): Promise<void> {
  const client = getPrismaClient();
  await client.$connect();
  logger.info('[Prisma] Connected to PostgreSQL');
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('[Prisma] Connection closed successfully');
  }
}
