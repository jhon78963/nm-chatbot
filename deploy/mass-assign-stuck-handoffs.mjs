#!/usr/bin/env node
/**
 * Mass-assigns conversations where Angela promised an advisor but stayed in bot mode.
 *
 * Usage (from repo root on VPS):
 *   node --env-file=.env deploy/mass-assign-stuck-handoffs.mjs              # dry-run
 *   APPLY=1 node --env-file=.env deploy/mass-assign-stuck-handoffs.mjs      # execute
 *
 * Optional:
 *   PHONE_NUMBERS=+51999308157,+51971048032   # always include these (normalized)
 *   SINCE_DAYS=30                             # only scan conversations updated in N days
 *   LIMIT=500                                 # max conversations to process
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI ?? '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'chatbot_uprit';
const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';
const SINCE_DAYS = Number(process.env.SINCE_DAYS ?? '45');
const LIMIT = Number(process.env.LIMIT ?? '500');

const IMPLICIT_HANDOFF_PROMISE_PATTERN =
  /(?:te voy a comunicar|te estoy derivando|te comunicar[eé]|derivar(?:te)? con|comunicarte con|derivando ahora).{0,80}asesor|(?:en breve|en unos momentos|un momento|apenas).{0,80}asesor|asesor especializado se comunicar[aá]|asesor especializado tiene|Para brindarte la informaci[oó]n exacta y una atenci[oó]n personalizada/i;

function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('51') && digits.length === 11) return `+${digits}`;
  if (digits.length === 9) return `+51${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

function detectImplicitHandoffPromise(text) {
  return IMPLICIT_HANDOFF_PROMISE_PATTERN.test(text ?? '');
}

const explicitPhones = new Set(
  (process.env.PHONE_NUMBERS ?? '')
    .split(',')
    .map((p) => normalizePhone(p.trim()))
    .filter(Boolean),
);

const excludedUsernames = new Set(
  (process.env.HANDOFF_EXCLUDED_AGENT_USERNAMES ?? 'zero.dev,zero')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
const db = mongoose.connection.db;
const agentsCol = db.collection('agents');
const convCol = db.collection('conversations');
const msgCol = db.collection('messages');
const funnelCol = db.collection('funnel_users');

console.log(`✅ MongoDB ${MONGODB_DB_NAME} | mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const agents = await agentsCol.find({ status: 'Active' }).toArray();
const fieldAgents = agents.filter((a) => {
  const username = (a.username ?? '').toLowerCase();
  if (!username || excludedUsernames.has(username)) return false;
  return a.role === 'agent';
});
const pool = fieldAgents.length > 0 ? fieldAgents : agents.filter((a) => {
  const username = (a.username ?? '').toLowerCase();
  return username && !excludedUsernames.has(username) && a.role !== 'admin';
});

if (pool.length === 0) {
  console.error('❌ No eligible agents in pool.');
  process.exit(1);
}

console.log(`Agentes en pool (${pool.length}):`);
for (const a of pool) console.log(`  · ${a.name} (${a.username})`);

const since = new Date(Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000);
const candidates = await convCol
  .find({
    status: 'active',
    mode: 'bot',
    updatedAt: { $gte: since },
  })
  .sort({ updatedAt: -1 })
  .limit(LIMIT)
  .project({ _id: 1, phoneNumber: 1, assignedAgentId: 1, handoffState: 1, updatedAt: 1 })
  .toArray();

console.log(`\nCandidatos bot activos (últimos ${SINCE_DAYS}d): ${candidates.length}`);
if (explicitPhones.size > 0) {
  console.log(`Teléfonos forzados: ${[...explicitPhones].join(', ')}`);
}

const toAssign = [];

for (const conv of candidates) {
  const phone = normalizePhone(conv.phoneNumber);
  const forced = explicitPhones.has(phone);

  const assistantMsgs = await msgCol
    .find({ conversationId: String(conv._id), role: 'assistant' })
    .sort({ timestamp: -1 })
    .limit(8)
    .project({ content: 1, timestamp: 1 })
    .toArray();

  const promised = assistantMsgs.some((m) => detectImplicitHandoffPromise(m.content));
  if (!promised && !forced) continue;

  const userMsgsAfterPromise = await msgCol.countDocuments({
    conversationId: String(conv._id),
    role: 'user',
    ...(assistantMsgs[0]?.timestamp ? { timestamp: { $gte: assistantMsgs[0].timestamp } } : {}),
  });

  toAssign.push({
    conv,
    phone,
    forced,
    promised,
    unread: Math.max(1, userMsgsAfterPromise),
    snippet: assistantMsgs.find((m) => detectImplicitHandoffPromise(m.content))?.content?.slice(0, 90) ?? '',
  });
}

console.log(`\nConversaciones a asignar: ${toAssign.length}\n`);

if (toAssign.length === 0) {
  await mongoose.disconnect();
  process.exit(0);
}

let agentIdx = 0;
let applied = 0;

for (const item of toAssign) {
  const agent = pool[agentIdx % pool.length];
  agentIdx++;
  const now = new Date();
  const label = `${item.phone} (${item.forced ? 'forzado' : 'promesa bot'})`;

  if (!APPLY) {
    console.log(`  [dry] ${label} → ${agent.name} | "${item.snippet}…"`);
    continue;
  }

  await convCol.updateOne(
    { _id: item.conv._id },
    {
      $set: {
        mode: 'human',
        handoffState: 'confirmed',
        assignedAgentId: agent.id,
        handoffAt: now,
        handoffBy: 'system',
        unreadCountAgent: item.unread,
        updatedAt: now,
      },
    },
  );

  const senderVariants = [item.phone, item.phone.replace(/^\+/, ''), item.conv.phoneNumber].filter(Boolean);
  await funnelCol.updateMany(
    { senderId: { $in: [...new Set(senderVariants)] } },
    { $set: { stage: 'HANDOFF', assignedAgent: agent.id, updatedAt: now } },
  );

  applied++;
  console.log(`  ✓ ${label} → ${agent.name}`);
}

if (APPLY) {
  console.log(`\n✅ ${applied} conversación(es) pasadas a modo humano y asignadas.`);
} else {
  console.log(`\n(dry-run) Ejecuta con APPLY=1 para aplicar ${toAssign.length} asignaciones.`);
}

await mongoose.disconnect();
