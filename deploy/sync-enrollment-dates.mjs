/**
 * sync-enrollment-dates.mjs
 * Appends enrollment dates from enrollment_policies into context_source_data
 * so MongoDB text search can find date-related queries.
 *
 * Usage:
 *   node --env-file=.env deploy/sync-enrollment-dates.mjs
 *   node --env-file=.env deploy/sync-enrollment-dates.mjs 8b17d0d7-9c16-4ffc-b761-691a3376e045
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'uprit-db';
const targetProgramId = process.argv[2] || null;

const DATE_TYPE_LABELS = {
  INSCRIPTION_DATE: 'Fecha de Inscripción',
  ALLOWED_ADMISSIONS: 'Permitir Admisiones hasta',
  EXAM: 'Exámen de Admisión',
  START_DATE: 'Inicio de Clases',
};

const MARKER = 'Fechas de enrolamiento:';

function resolveDateTypeLabel(type) {
  return DATE_TYPE_LABELS[type] ?? type;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(date));
}

function formatEnrollmentDatesSection(policies) {
  if (!policies.length) return '';

  const lines = [MARKER];
  for (const policy of policies) {
    if (!policy.dates?.length) continue;
    const label = [policy.careerType, policy.period].filter(Boolean).join(' - ');
    if (label) lines.push(`  ${label}:`);
    for (const entry of policy.dates) {
      lines.push(`    - ${resolveDateTypeLabel(entry.type)}: ${formatDate(entry.date)}`);
    }
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

function stripEnrollmentDatesSection(baseContent) {
  const markerIndex = (baseContent || '').indexOf(MARKER);
  if (markerIndex < 0) return baseContent || '';
  return (baseContent || '').slice(0, markerIndex).trimEnd();
}

function appendEnrollmentDates(baseContent, policies) {
  const section = formatEnrollmentDatesSection(policies);
  if (!section) return null;
  const stripped = stripEnrollmentDatesSection(baseContent);
  return `${stripped}\n${section}`;
}

if (!uri) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);

  const policyFilter = { isActive: true };
  if (targetProgramId) policyFilter.careerId = targetProgramId;

  const policies = await db.collection('enrollment_policies').find(policyFilter).toArray();
  const policiesByCareer = new Map();
  for (const policy of policies) {
    const list = policiesByCareer.get(policy.careerId) ?? [];
    list.push(policy);
    policiesByCareer.set(policy.careerId, list);
  }

  console.log(`Found ${policies.length} active enrollment policies for ${policiesByCareer.size} program(s)`);

  let updated = 0;
  let skipped = 0;
  let created = 0;

  for (const [careerId, careerPolicies] of policiesByCareer) {
    const section = formatEnrollmentDatesSection(careerPolicies);
    if (!section) {
      skipped++;
      continue;
    }

    const program = await db.collection('programs').findOne({ id: careerId });
    const programName = program?.name ?? careerId;

    const existing = await db.collection('context_source_data').findOne({ original_id: careerId });
    if (existing) {
      const nextContent = appendEnrollmentDates(existing.full_text_content, careerPolicies);
      if (!nextContent) {
        console.log(`SKIP (no dates): ${programName}`);
        skipped++;
        continue;
      }

      if (nextContent === existing.full_text_content) {
        console.log(`SKIP (unchanged): ${programName}`);
        skipped++;
        continue;
      }

      await db.collection('context_source_data').updateOne(
        { original_id: careerId },
        { $set: { full_text_content: nextContent, updated_at: new Date() } },
      );
      console.log(`UPDATED: ${programName}`);
      updated++;
      continue;
    }

    const baseLines = [];
    if (program?.name) baseLines.push(`Nombre: ${program.name}`);
    if (program?.summary) baseLines.push(`Resumen: ${program.summary}`);
    if (program?.iaInformation) baseLines.push(`Detalle IA: ${program.iaInformation}`);

    const fullTextContent = `${baseLines.join('\n').trimEnd()}\n${section}`.trim();
    await db.collection('context_source_data').insertOne({
      original_id: careerId,
      program_name: programName,
      full_text_content: fullTextContent,
      updated_at: new Date(),
    });
    console.log(`CREATED: ${programName}`);
    created++;
  }

  console.log(`\nDone. updated=${updated}, created=${created}, skipped=${skipped}`);
} finally {
  await client.close();
}
