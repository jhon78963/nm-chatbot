import type { EnrollmentPolicySummary } from '../../domain/repositories/enrollment-policy.repository.js';

const ENROLLMENT_DATES_MARKER = 'Fechas de enrolamiento:';

const DATE_TYPE_LABELS: Record<string, string> = {
  INSCRIPTION_DATE: 'Fecha de Inscripción',
  ALLOWED_ADMISSIONS: 'Permitir Admisiones hasta',
  EXAM: 'Exámen de Admisión',
  START_DATE: 'Inicio de Clases',
};

function resolveDateTypeLabel(type: string): string {
  return DATE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(date));
}

export function formatEnrollmentDatesSection(policies: EnrollmentPolicySummary[]): string {
  if (policies.length === 0) return '';

  const lines: string[] = [ENROLLMENT_DATES_MARKER];
  for (const policy of policies) {
    if (policy.dates.length === 0) continue;

    const label = [policy.careerType, policy.period].filter(Boolean).join(' - ');
    if (label) lines.push(`  ${label}:`);

    for (const entry of policy.dates) {
      lines.push(`    - ${resolveDateTypeLabel(entry.type)}: ${formatDate(entry.date)}`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

export function formatEnrollmentDatesFromPolicy(policy: EnrollmentPolicySummary | null): string {
  if (!policy || policy.dates.length === 0) return '';
  return formatEnrollmentDatesSection([policy]);
}

export function formatEnrollmentDatesForTool(
  policies: EnrollmentPolicySummary[],
): Array<{ periodo: string; tipoCarrera: string; fechas: Array<{ tipo: string; fecha: string }> }> {
  return policies
    .filter((policy) => policy.dates.length > 0)
    .map((policy) => ({
      periodo: policy.period,
      tipoCarrera: policy.careerType,
      fechas: policy.dates.map((entry) => ({
        tipo: resolveDateTypeLabel(entry.type),
        fecha: formatDate(entry.date),
      })),
    }));
}

export function appendEnrollmentDates(
  baseContent: string,
  policies: EnrollmentPolicySummary[],
): string {
  const section = formatEnrollmentDatesSection(policies);
  if (!section) return stripEnrollmentDatesSection(baseContent);
  const stripped = stripEnrollmentDatesSection(baseContent);
  return stripped ? `${stripped}\n${section}` : section;
}

export function appendEnrollmentDateFromPolicy(
  baseContent: string,
  policies: EnrollmentPolicySummary[],
): string {
  return appendEnrollmentDates(baseContent, policies);
}

function stripEnrollmentDatesSection(baseContent: string): string {
  const markerIndex = baseContent.indexOf(ENROLLMENT_DATES_MARKER);
  if (markerIndex < 0) return baseContent;
  return baseContent.slice(0, markerIndex).trimEnd();
}
