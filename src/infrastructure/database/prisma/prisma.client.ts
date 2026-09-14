import { PrismaClient } from '@prisma/client';
// Cliente de catálogo generado desde prisma/catalog.schema.prisma
// Apunta a DATABASE_URL (nm_services, solo lectura de productos y ERP)
import { PrismaClient as CatalogClient } from '../../../generated/catalog-client/index.js';
import { logger } from '../../shared/logger.js';

// ── Chatbot DB (CHATBOT_DATABASE_URL → chatbot_db) ────────────────────────────
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
  logger.info('[Prisma] Connected to chatbot_db (PostgreSQL)');
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('[Prisma] Chatbot DB connection closed');
  }
}

// ── Catalog DB (DATABASE_URL → nm_services, solo lectura) ────────────────────
let catalogClient: CatalogClient | null = null;

export function getCatalogPrismaClient(): CatalogClient {
  if (!catalogClient) {
    catalogClient = new CatalogClient();
  }
  return catalogClient;
}

export async function connectCatalogPrisma(): Promise<void> {
  const client = getCatalogPrismaClient();
  await client.$connect();
  logger.info('[Prisma] Connected to nm_services catalog DB (read-only)');
}

export async function disconnectCatalogPrisma(): Promise<void> {
  if (catalogClient) {
    await catalogClient.$disconnect();
    catalogClient = null;
    logger.info('[Prisma] Catalog DB connection closed');
  }
}
