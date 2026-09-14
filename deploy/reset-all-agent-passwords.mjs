#!/usr/bin/env node
/**
 * Regenerates temporary passwords for ALL active agents.
 * Usage: node --env-file=.env deploy/reset-all-agent-passwords.mjs
 * NEVER commit the output.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/chatbot_uprit';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'chatbot_uprit';
const BCRYPT_ROUNDS = 10;

function generatePassword() {
  return randomBytes(8).toString('base64url').slice(0, 12) + '!A1';
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log(`Connected to MongoDB (${MONGODB_DB_NAME})\n`);

const Agent = mongoose.model(
  'Agent',
  new mongoose.Schema({}, { strict: false, collection: 'agents' }),
);

const agents = await Agent.find({}).sort({ name: 1 }).lean();

if (agents.length === 0) {
  console.log('No active agents found.');
  await mongoose.disconnect();
  process.exit(0);
}

console.log('CREDENCIALES DE AGENTES (UPRIT Asesores)\n');
console.log('─'.repeat(50));

for (const agent of agents) {
  const tempPassword = generatePassword();
  const hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
  await Agent.updateOne({ _id: agent._id }, { $set: { passwordHash: hash } });

  console.log(`Agente  : ${agent.name}`);
  console.log(`Usuario : ${agent.username ?? '(sin username)'}`);
  console.log(`Password: ${tempPassword}`);
  console.log(`Email   : ${agent.email ?? ''}`);
  console.log('─'.repeat(50));
}

await mongoose.disconnect();
console.log(`\nTotal: ${agents.length} agentes`);
