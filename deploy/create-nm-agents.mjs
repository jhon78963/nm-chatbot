#!/usr/bin/env node
/**
 * Sync ERP Admin/Super Admin users → PostgreSQL chat_agents (SSO mapping).
 *
 * SSO resolves agents by username, then by userId (= users.id from ERP JWT `sub`).
 *
 * Usage (from services/chatbot):
 *   npm run create:agents:nm          # sync + report
 *   npm run verify:agents:erp         # verify only (exit 1 if missing)
 *   node --env-file=.env deploy/create-nm-agents.mjs --verify-only
 *
 * Optional env:
 *   NM_AGENT_PASSWORD=nm2026!        # password for newly created agents
 *   NM_AGENT_RESET_PASSWORDS=true    # also reset password on existing agents
 */

import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma, disconnectPrisma } from './prisma-client.mjs';

const BCRYPT_ROUNDS = 10;
const DEFAULT_PASSWORD = process.env.NM_AGENT_PASSWORD ?? 'nm2026!';
const RESET_PASSWORDS = process.env.NM_AGENT_RESET_PASSWORDS === 'true';
const VERIFY_ONLY = process.argv.includes('--verify-only');
const ERP_ADMIN_ROLES = ['Admin', 'Super Admin'];

/** Non-ERP handoff agents (WhatsApp asesores). userId stays script-local. */
const MANUAL_SUPPORT_AGENTS = [
  {
    id: 'nm-agent-asesor-001',
    userId: 'nm-agent-asesor-001',
    username: 'asesor1.nm',
    email: 'asesor1@novedadesmaritex.net.pe',
    name: 'Asesor 1 NM',
    whatsapp: '+51999999901',
    role: 'agent',
  },
  {
    id: 'nm-agent-asesor-002',
    userId: 'nm-agent-asesor-002',
    username: 'asesor2.nm',
    email: 'asesor2@novedadesmaritex.net.pe',
    name: 'Asesor 2 NM',
    whatsapp: '+51999999902',
    role: 'agent',
  },
];

const DEFAULT_WHATSAPP = '+51999999999';

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL no está definida en .env');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function displayName(user) {
  return `${user.name} ${user.surname}`.trim() || user.username;
}

function resolveWhatsapp(phone) {
  const trimmed = (phone ?? '').trim();
  if (!trimmed) return DEFAULT_WHATSAPP;
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

async function fetchErpAdminUsers() {
  return prisma.user.findMany({
    where: {
      isDeleted: false,
      isEnabled: true,
      userRoles: {
        some: {
          role: {
            name: { in: ERP_ADMIN_ROLES },
          },
        },
      },
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      surname: true,
      phone: true,
      userRoles: {
        select: {
          role: { select: { name: true } },
        },
      },
    },
    orderBy: { username: 'asc' },
  });
}

async function findLinkedAgent(admin) {
  const username = normalizeUsername(admin.username);
  const email = normalizeEmail(admin.email);

  return prisma.chatAgent.findFirst({
    where: {
      OR: [{ userId: admin.id }, { username }, { email }],
    },
  });
}

async function verifyErpAdminMappings(admins) {
  const rows = [];
  const missing = [];

  for (const admin of admins) {
    const agent = await findLinkedAgent(admin);
    const roles = admin.userRoles.map((entry) => entry.role.name).join(', ');
    const linked =
      !!agent
      && agent.status === 'Active'
      && normalizeUsername(agent.username ?? '') === normalizeUsername(admin.username)
      && agent.userId === admin.id;

    rows.push({
      username: admin.username,
      email: admin.email,
      erpUserId: admin.id,
      roles,
      agentId: agent?.id ?? '—',
      agentUserId: agent?.userId ?? '—',
      agentStatus: agent?.status ?? 'MISSING',
      linked,
    });

    if (!linked) {
      missing.push(admin);
    }
  }

  return { rows, missing };
}

function printVerificationReport(rows) {
  console.log('\nVerificación ERP → chat_agents');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  for (const row of rows) {
    const status = row.linked ? 'OK' : 'MISSING';
    console.log(
      `${status.padEnd(7)} | ${row.username.padEnd(16)} | agent.userId=${row.agentUserId} | erp.id=${row.erpUserId}`,
    );
  }
  console.log('─────────────────────────────────────────────────────────────────────────────');
}

async function upsertErpAdminAgent(admin) {
  const username = normalizeUsername(admin.username);
  const email = normalizeEmail(admin.email);
  const existing = await findLinkedAgent(admin);

  const data = {
    userId: admin.id,
    name: displayName(admin),
    email,
    whatsapp: resolveWhatsapp(admin.phone),
    status: 'Active',
    username,
    role: 'admin',
  };

  if (existing) {
    const update = { ...data };
    if (RESET_PASSWORDS) {
      update.passwordHash = passwordHash;
    }

    await prisma.chatAgent.update({
      where: { id: existing.id },
      data: update,
    });

    return { action: 'updated', username, email, userId: admin.id };
  }

  await prisma.chatAgent.create({
    data: {
      id: randomUUID(),
      ...data,
      passwordHash,
    },
  });

  return { action: 'created', username, email, userId: admin.id };
}

async function upsertManualAgent(agent) {
  const username = normalizeUsername(agent.username);
  const email = normalizeEmail(agent.email);

  await prisma.chatAgent.upsert({
    where: { email },
    create: {
      id: agent.id,
      userId: agent.userId,
      name: agent.name,
      email,
      whatsapp: agent.whatsapp,
      status: 'Active',
      username,
      passwordHash,
      role: agent.role,
    },
    update: {
      name: agent.name,
      status: 'Active',
      username,
      role: agent.role,
      whatsapp: agent.whatsapp,
      ...(RESET_PASSWORDS ? { passwordHash } : {}),
    },
  });

  return { action: 'manual', username, email, userId: agent.userId };
}

console.log('NM Maritex — mapeo ERP admin → chat_agents\n');

const erpAdmins = await fetchErpAdminUsers();

if (erpAdmins.length === 0) {
  console.warn('⚠️  No se encontraron usuarios ERP con rol Admin/Super Admin.');
}

if (!VERIFY_ONLY) {
  console.log(`Sincronizando ${erpAdmins.length} admin(s) ERP...\n`);

  for (const admin of erpAdmins) {
    const result = await upsertErpAdminAgent(admin);
    console.log(
      `✅ ${result.action.padEnd(7)} | ${result.username} | userId=${result.userId} | ${result.email}`,
    );
  }

  console.log(`\nSincronizando ${MANUAL_SUPPORT_AGENTS.length} asesor(es) manuales...\n`);

  for (const agent of MANUAL_SUPPORT_AGENTS) {
    const result = await upsertManualAgent(agent);
    console.log(
      `✅ ${result.action.padEnd(7)} | ${result.username} | userId=${result.userId} | ${result.email}`,
    );
  }
}

const { rows, missing } = await verifyErpAdminMappings(erpAdmins);
printVerificationReport(rows);

if (missing.length > 0) {
  console.error(`\n❌ ${missing.length} admin(s) ERP sin agente activo vinculado.`);
  for (const admin of missing) {
    console.error(`   - ${admin.username} (${admin.email}) id=${admin.id}`);
  }
  await disconnectPrisma();
  process.exit(1);
}

console.log(`\n✅ Todos los admin(s) ERP (${erpAdmins.length}) tienen agente activo vinculado.`);

if (!VERIFY_ONLY) {
  console.log('\n─────────────────────────────────────────');
  console.log('CREDENCIALES INICIALES (solo agentes nuevos / reset):');
  console.log('─────────────────────────────────────────');
  console.log(`  Password por defecto: ${DEFAULT_PASSWORD}`);
  console.log('  Cambiar tras primer login en producción.');
}

await disconnectPrisma();
console.log('\nDone.');
