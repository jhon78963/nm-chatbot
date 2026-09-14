#!/usr/bin/env node
/**
 * Seed script: assigns username + temporary password to agents that don't have one.
 *
 * Usage (from repo root):
 *   node --env-file=.env deploy/seed-agent-passwords.mjs
 *
 * The script prints temporary credentials to stdout.
 * Share them securely with each agent and instruct them to change their
 * password in a future /auth/change-password endpoint (Phase 2).
 *
 * NEVER commit this output to version control.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/chatbot_uprit';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'chatbot_uprit';
const BCRYPT_ROUNDS = 10;

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log(`✅ Connected to MongoDB (${MONGODB_DB_NAME})\n`);

const Agent = mongoose.model(
  'Agent',
  new mongoose.Schema(
    {
      id: String,
      name: String,
      email: String,
      status: String,
      username: { type: String, default: null },
      passwordHash: { type: String, default: null },
      lastLoginAt: { type: Date, default: null },
    },
    { collection: 'agents', strict: false },
  ),
);

const agents = await Agent.find({}).lean();
if (agents.length === 0) {
  console.log('⚠️  No agents found in DB. Add agents first.');
  await mongoose.disconnect();
  process.exit(0);
}

const credentials = [];

for (const agent of agents) {
  const needsUsername = !agent.username;
  const needsPassword = !agent.passwordHash;

  if (!needsUsername && !needsPassword) {
    console.log(`⏭️  ${agent.name} — already has username and password, skipped`);
    continue;
  }

  let username = agent.username;
  if (needsUsername) {
    username = deriveUsername(agent.name, agent.email);
  }

  let tempPassword = null;
  let hash = agent.passwordHash;
  if (needsPassword) {
    tempPassword = generatePassword();
    hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
  }

  await Agent.updateOne(
    { _id: agent._id },
    {
      $set: {
        ...(needsUsername ? { username } : {}),
        ...(needsPassword ? { passwordHash: hash } : {}),
      },
    },
  );

  credentials.push({ name: agent.name, username, tempPassword });
  console.log(`✅ ${agent.name} — username: ${username}${tempPassword ? ` | temp password: ${tempPassword}` : ' (password unchanged)'}`);
}

if (credentials.length > 0) {
  console.log('\n─────────────────────────────────────────');
  console.log('CREDENCIALES TEMPORALES (compartir de forma segura):');
  console.log('─────────────────────────────────────────');
  for (const c of credentials) {
    if (c.tempPassword) {
      console.log(`  Agente : ${c.name}`);
      console.log(`  Usuario: ${c.username}`);
      console.log(`  Password: ${c.tempPassword}`);
      console.log('');
    }
  }
  console.log('⚠️  Instrucciones para el agente: cambiar la contraseña tras el primer login.');
}

await mongoose.disconnect();
console.log('Done.');

// ─── helpers ────────────────────────────────────────────────────────────────

function deriveUsername(name, email) {
  if (email) {
    const local = email.split('@')[0];
    if (local) return local.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  }
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 30);
}

function generatePassword() {
  return randomBytes(8).toString('base64url').slice(0, 12) + '!A1';
}
