#!/usr/bin/env node
/**
 * Creates (or updates) an agent user for the admissions panel.
 *
 * Usage (from repo root):
 *   AGENT_USERNAME=zero.dev AGENT_PASSWORD='secret' AGENT_NAME="Zero Test" \
 *     node --env-file=.env deploy/create-agent-user.mjs
 *
 * Optional env vars:
 *   AGENT_USERNAME   (required)
 *   AGENT_PASSWORD   (required)
 *   AGENT_NAME       default: derived from username
 *   AGENT_EMAIL      default: {username}@uprit.edu.pe
 *   AGENT_WHATSAPP   default: +51999999999
 *   AGENT_ROLE       agent | admin  (default: agent)
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/chatbot_uprit';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'chatbot_uprit';
const BCRYPT_ROUNDS = 10;

const USERNAME = (process.env.AGENT_USERNAME ?? '').toLowerCase().trim();
const PASSWORD = process.env.AGENT_PASSWORD ?? '';
const ROLE = process.env.AGENT_ROLE === 'admin' ? 'admin' : 'agent';
const NAME = process.env.AGENT_NAME ?? USERNAME.replace(/\./g, ' ');
const EMAIL = (process.env.AGENT_EMAIL ?? `${USERNAME.replace(/[^a-z0-9._-]/g, '')}@uprit.edu.pe`).toLowerCase().trim();
const WHATSAPP = process.env.AGENT_WHATSAPP ?? '+51999999999';

if (!USERNAME || !PASSWORD) {
  console.error('Error: AGENT_USERNAME y AGENT_PASSWORD son obligatorios.');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log(`✅ Connected to MongoDB (${MONGODB_DB_NAME})\n`);

const Agent = mongoose.model(
  'Agent',
  new mongoose.Schema({}, { collection: 'agents', strict: false }),
);

const existing = await Agent.findOne({ username: USERNAME }).lean();
const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
const agentId = existing?.id ?? randomUUID();
const userId = existing?.userId ?? randomUUID();

const payload = {
  id: agentId,
  name: NAME,
  email: EMAIL,
  whatsapp: WHATSAPP,
  status: 'Active',
  userId,
  username: USERNAME,
  passwordHash,
  role: ROLE,
  lastLoginAt: null,
};

const db = mongoose.connection.db;
const result = await db.collection('agents').updateOne(
  { username: USERNAME },
  { $set: payload },
  { upsert: true },
);

if (existing || result.upsertedCount === 0) {
  console.log(`✅ Agente "${USERNAME}" actualizado (${ROLE})`);
} else {
  console.log(`✅ Agente "${USERNAME}" creado (${ROLE})`);
}
console.log(`   id: ${agentId}`);

console.log('\n─────────────────────────────────────────');
console.log('CREDENCIALES (no commitear):');
console.log('─────────────────────────────────────────');
console.log(`  Usuario: ${USERNAME}`);
console.log(`  Password: ${PASSWORD}`);
console.log(`  Rol: ${ROLE}`);

await mongoose.disconnect();
console.log('\nDone.');
