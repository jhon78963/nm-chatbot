#!/usr/bin/env node
/**
 * Restore chatbot configuration from deploy/seeds/*.json
 *
 * Usage:
 *   NM_AGENT_PASSWORD='secret' npm run restore:chatbot
 *   npm run restore:chatbot -- secret
 *
 * Agents are upserted by email; password_hash is set from NM_AGENT_PASSWORD (required).
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { prisma, disconnectPrisma } from './prisma-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.join(__dirname, 'seeds');
const BCRYPT_ROUNDS = 10;

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL no está definida en .env');
  process.exit(1);
}

const password = process.env.NM_AGENT_PASSWORD ?? process.argv[2];
if (!password) {
  console.error(
    'Error: proporciona contraseña para chat_agents.\n' +
      '  NM_AGENT_PASSWORD=... npm run restore:chatbot\n' +
      '  npm run restore:chatbot -- tuPassword',
  );
  process.exit(1);
}

function readJson(fileName) {
  const filePath = path.join(seedsDir, fileName);
  if (!existsSync(filePath)) {
    console.warn(`⚠️  ${fileName} no encontrado — omitiendo`);
    return [];
  }
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function parseDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

console.log('NM Chatbot — restaurando configuración...\n');

const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

const agents = readJson('chat-agents.json');
let agentCount = 0;

for (const agent of agents) {
  if (!agent.email) {
    console.warn('⚠️  agente sin email — omitiendo', agent.id);
    continue;
  }

  await prisma.chatAgent.upsert({
    where: { email: agent.email },
    create: {
      id: agent.id,
      userId: agent.userId ?? agent.id,
      name: agent.name,
      email: agent.email,
      whatsapp: agent.whatsapp ?? '',
      status: agent.status ?? 'Active',
      username: agent.username ?? null,
      passwordHash,
      role: agent.role ?? 'agent',
      lastLoginAt: parseDate(agent.lastLoginAt) ?? null,
      calendarLink: agent.calendarLink ?? null,
      picture: agent.picture ?? null,
      description: agent.description ?? null,
      location: agent.location ?? null,
    },
    update: {
      userId: agent.userId ?? agent.id,
      name: agent.name,
      whatsapp: agent.whatsapp ?? '',
      status: agent.status ?? 'Active',
      username: agent.username ?? null,
      passwordHash,
      role: agent.role ?? 'agent',
      calendarLink: agent.calendarLink ?? null,
      picture: agent.picture ?? null,
      description: agent.description ?? null,
      location: agent.location ?? null,
    },
  });

  agentCount += 1;
  console.log(`✅ agent | ${agent.username ?? agent.email}`);
}

const quickReplies = readJson('chat-quick-replies.json');
let quickReplyCount = 0;

for (const reply of quickReplies) {
  if (!reply.id) {
    console.warn('⚠️  quick reply sin id — omitiendo');
    continue;
  }

  await prisma.chatQuickReply.upsert({
    where: { id: reply.id },
    create: {
      id: reply.id,
      title: reply.title,
      body: reply.body,
      createdBy: reply.createdBy,
    },
    update: {
      title: reply.title,
      body: reply.body,
      createdBy: reply.createdBy,
    },
  });

  quickReplyCount += 1;
}

const contextRows = readJson('chat-context-data.json');
let contextCount = 0;

for (const row of contextRows) {
  if (!row.originalId) {
    console.warn('⚠️  context_data sin originalId — omitiendo', row.id);
    continue;
  }

  await prisma.chatContextData.upsert({
    where: { originalId: row.originalId },
    create: {
      id: row.id,
      originalId: row.originalId,
      fullTextContent: row.fullTextContent,
      productName: row.productName,
      updatedAt: parseDate(row.updatedAt) ?? new Date(),
    },
    update: {
      fullTextContent: row.fullTextContent,
      productName: row.productName,
      updatedAt: parseDate(row.updatedAt) ?? new Date(),
    },
  });

  contextCount += 1;
}

console.log('\n─────────────────────────────────────────');
console.log(`Agentes restaurados:      ${agentCount}`);
console.log(`Quick replies restaurados: ${quickReplyCount}`);
console.log(`Context RAG restaurados:   ${contextCount}`);
console.log('─────────────────────────────────────────');

await disconnectPrisma();
console.log('\nDone.');
