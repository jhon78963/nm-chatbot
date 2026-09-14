/**
 * Clientes Prisma compartidos para scripts de deploy.
 *
 * prisma        → chatbot_db   (CHATBOT_DATABASE_URL) — lectura/escritura de tablas chat_*
 * catalogPrisma → nm_services  (DATABASE_URL)          — solo lectura: productos, ERP users
 */
import { PrismaClient } from '@prisma/client';
import { PrismaClient as CatalogPrismaClient } from '../src/generated/catalog-client/index.js';

export const prisma = new PrismaClient();
export const catalogPrisma = new CatalogPrismaClient();

export async function disconnectPrisma() {
  await prisma.$disconnect();
  await catalogPrisma.$disconnect();
}
