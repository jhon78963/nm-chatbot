#!/usr/bin/env node
/**
 * Sync active NM products from PostgreSQL → chat_context_data (RAG).
 *
 * Usage (from services/chatbot):
 *   npm run sync:products
 *   node --env-file=.env deploy/sync-products-to-context.mjs
 */

import { prisma, disconnectPrisma } from './prisma-client.mjs';
import { buildProductUrl } from './product-slug.mjs';

const STORE_URL = (process.env.STORE_URL ?? 'https://novedadesmaritex.net.pe').replace(/\/$/, '');

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL no está definida en .env');
  process.exit(1);
}

function formatPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

function buildFullTextContent(product) {
  const category = product.gender?.name ?? 'Sin categoría';
  const barcodeLine = product.barcode ? `Código: ${product.barcode}` : '';

  const sizeLines = product.productSizes.map((ps) => {
    const colors = ps.productSizeColors
      .map((psc) => psc.color?.description)
      .filter(Boolean)
      .join(', ');
    const stock = ps.inventoryBalances.reduce((sum, b) => sum + b.quantity, 0);
  return `- Talla ${ps.size?.description ?? '—'}: S/ ${formatPrice(ps.salePrice)}
  Colores disponibles: ${colors || '—'}
  Stock total: ${stock} unidades`;
  });

  const featured = product.isFeatured ? '⭐ Producto destacado' : '';
  const onSale = product.isOnSale ? '🔥 En oferta' : '';
  const badges = [featured, onSale].filter(Boolean).join('\n');

  return [
    `Producto: ${product.name}`,
    `Categoría: ${category}`,
    barcodeLine,
    '',
    'Disponible en las siguientes tallas:',
    sizeLines.join('\n'),
    '',
    badges,
    '',
    `Ver producto en tienda: ${buildProductUrl(STORE_URL, product)}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

console.log('NM Maritex — sincronizando productos → chat_context_data...\n');

const products = await prisma.product.findMany({
  where: { isDeleted: false, status: 'active' },
  include: {
    gender: true,
    productSizes: {
      where: { isDeleted: false },
      include: {
        size: true,
        productSizeColors: { include: { color: true } },
        inventoryBalances: true,
      },
    },
    media: { where: { isCover: true }, take: 1 },
  },
});

let synced = 0;

for (const product of products) {
  const fullTextContent = buildFullTextContent(product);

  await prisma.chatContextData.upsert({
    where: { originalId: product.id },
    create: {
      originalId: product.id,
      fullTextContent,
      productName: product.name,
      updatedAt: new Date(),
    },
    update: {
      fullTextContent,
      productName: product.name,
      updatedAt: new Date(),
    },
  });

  synced += 1;
}

console.log(`Sincronizados ${synced} productos → chat_context_data`);

await disconnectPrisma();
console.log('Done.');
