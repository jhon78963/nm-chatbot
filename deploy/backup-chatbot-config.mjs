#!/usr/bin/env node
/**
 * Backup chatbot configuration tables to deploy/seeds/*.json
 * (agents without password_hash, quick replies, context/RAG data).
 *
 * Usage: npm run backup:chatbot
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, disconnectPrisma } from './prisma-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.join(__dirname, 'seeds');

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL no está definida en .env');
  process.exit(1);
}

function serialize(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serialize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serialize(entry)]),
    );
  }
  return value;
}

mkdirSync(seedsDir, { recursive: true });

console.log('NM Chatbot — backup de configuración...\n');

const agents = await prisma.chatAgent.findMany({
  select: {
    id: true,
    userId: true,
    name: true,
    email: true,
    whatsapp: true,
    status: true,
    username: true,
    role: true,
    lastLoginAt: true,
    calendarLink: true,
    picture: true,
    description: true,
    location: true,
    createdAt: true,
    updatedAt: true,
  },
  orderBy: { email: 'asc' },
});

const quickReplies = await prisma.chatQuickReply.findMany({
  orderBy: { title: 'asc' },
});

const contextData = await prisma.chatContextData.findMany({
  orderBy: { productName: 'asc' },
});

const files = [
  { name: 'chat-agents.json', data: agents },
  { name: 'chat-quick-replies.json', data: quickReplies },
  { name: 'chat-context-data.json', data: contextData },
];

for (const { name, data } of files) {
  const filePath = path.join(seedsDir, name);
  writeFileSync(filePath, `${JSON.stringify(serialize(data), null, 2)}\n`, 'utf8');
  console.log(`✅ ${name} — ${data.length} registros`);
}

console.log('\nBackup guardado en deploy/seeds/');

await disconnectPrisma();
console.log('Done.');
