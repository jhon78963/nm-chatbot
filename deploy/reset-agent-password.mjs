#!/usr/bin/env node
/**
 * Reset a chat agent password in PostgreSQL (chat_agents).
 *
 * Usage:
 *   npm run reset:password -- admin nuevaPassword123
 *   node --env-file=.env deploy/reset-agent-password.mjs <username> <newPassword>
 */

import bcrypt from 'bcryptjs';
import { prisma, disconnectPrisma } from './prisma-client.mjs';

const BCRYPT_ROUNDS = 10;

const username = (process.argv[2] ?? '').toLowerCase().trim();
const newPassword = process.argv[3] ?? '';

if (!username || !newPassword) {
  console.error('Uso: node deploy/reset-agent-password.mjs <username> <newPassword>');
  console.error('Ejemplo: node deploy/reset-agent-password.mjs admin nm2026!');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL no está definida en .env');
  process.exit(1);
}

const agent = await prisma.chatAgent.findFirst({
  where: { username },
});

if (!agent) {
  console.error(`Error: no existe agente con username "${username}"`);
  await disconnectPrisma();
  process.exit(1);
}

const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

await prisma.chatAgent.update({
  where: { id: agent.id },
  data: { passwordHash, status: 'Active' },
});

console.log(`✅ Contraseña actualizada para "${username}" (${agent.name})`);
console.log(`   id: ${agent.id}`);
console.log(`   email: ${agent.email}`);

await disconnectPrisma();
console.log('\nDone.');
