#!/usr/bin/env node
/**
 * Reassigns conversations away from a test agent (default: zero.dev).
 *
 * Usage (from repo root):
 *   node --env-file=.env deploy/reassign-test-agent-chats.mjs
 *
 * Optional env vars:
 *   TEST_AGENT_USERNAME        default: zero.dev
 *   KEEP_CONVERSATION_IDS      comma-separated IDs to leave on test agent
 *   MONGODB_URI
 *   MONGODB_DB_NAME
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/chatbot_uprit';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'chatbot_uprit';
const TEST_USERNAME = (process.env.TEST_AGENT_USERNAME ?? 'zero.dev').toLowerCase().trim();
const KEEP_IDS = new Set(
  (process.env.KEEP_CONVERSATION_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log(`✅ Connected to MongoDB (${MONGODB_DB_NAME})\n`);

const db = mongoose.connection.db;
const agentsCol = db.collection('agents');
const convCol = db.collection('conversations');
const funnelCol = db.collection('funnel_users');

const testAgent = await agentsCol.findOne({ username: TEST_USERNAME });
if (!testAgent) {
  console.error(`❌ Agente de prueba "${TEST_USERNAME}" no encontrado.`);
  process.exit(1);
}

const testAgentId = testAgent.id;
console.log(`Test agent: ${testAgent.name} (${TEST_USERNAME}) → ${testAgentId}\n`);

const otherAgents = await agentsCol
  .find({ status: 'Active', role: { $ne: 'admin' } })
  .project({ id: 1, name: 1, username: 1 })
  .toArray();

const excludedFromPool = new Set(
  (process.env.HANDOFF_EXCLUDED_AGENT_USERNAMES ?? 'zero.dev,zero')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
excludedFromPool.add(TEST_USERNAME);

const eligibleAgents = otherAgents.filter((a) => {
  const u = (a.username ?? '').toLowerCase();
  return u && !excludedFromPool.has(u);
});

if (eligibleAgents.length === 0) {
  console.error('❌ No hay otros agentes activos para reasignar.');
  process.exit(1);
}

console.log('Agentes destino:');
for (const a of eligibleAgents) console.log(`  - ${a.name} (${a.username ?? 'sin username'})`);

if (KEEP_IDS.size > 0) {
  console.log(`\nConservando en ${TEST_USERNAME}: ${[...KEEP_IDS].join(', ')}`);
}

const convs = await convCol
  .find({ assignedAgentId: testAgentId, status: 'active' })
  .project({ _id: 1, phoneNumber: 1, contactName: 1 })
  .toArray();

const toReassign = convs.filter((c) => !KEEP_IDS.has(String(c._id)));
const kept = convs.filter((c) => KEEP_IDS.has(String(c._id)));

if (kept.length > 0) {
  console.log(`\nManteniendo ${kept.length} chat(s) de prueba en ${TEST_USERNAME}:`);
  for (const c of kept) console.log(`  · ${c.contactName ?? c.phoneNumber ?? String(c._id)}`);
}

if (toReassign.length === 0) {
  console.log('\n✅ No hay conversaciones para reasignar.');
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`\nReasignando ${toReassign.length} conversación(es)...\n`);

let idx = 0;
for (const conv of toReassign) {
  const target = eligibleAgents[idx % eligibleAgents.length];
  idx++;

  await convCol.updateOne(
    { _id: conv._id },
    {
      $set: {
        assignedAgentId: target.id,
        updatedAt: new Date(),
      },
    },
  );

  if (conv.phoneNumber) {
    await funnelCol.updateMany(
      { senderId: conv.phoneNumber },
      { $set: { assignedAgent: target.id } },
    );
  }

  const label = conv.contactName ?? conv.phoneNumber ?? String(conv._id);
  console.log(`  ✓ ${label} → ${target.name}`);
}

console.log(`\n✅ ${toReassign.length} chat(s) reasignados. ${kept.length} chat(s) de prueba conservados.`);

await mongoose.disconnect();
console.log('Done.');
