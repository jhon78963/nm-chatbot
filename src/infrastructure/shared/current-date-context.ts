const DEFAULT_TIME_ZONE = 'America/Lima';

function formatTodayLong(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

function formatTodayShort(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(date);
}

/**
 * Operational date block injected into every AI system prompt at request time.
 * Keeps enrollment-date answers anchored to the server clock (America/Lima).
 */
export function buildCurrentDateContext(now = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const todayLong = formatTodayLong(now, timeZone);
  const todayShort = formatTodayShort(now, timeZone);

  return `───────────────────────────────────────────────────────────
FECHA ACTUAL DEL SISTEMA (${timeZone})
───────────────────────────────────────────────────────────
Hoy es ${todayLong} (${todayShort}).

REGLAS TEMPORALES OBLIGATORIAS:
- Usa SIEMPRE esta fecha como referencia para ubicar fechas de inscripción, admisión, exámenes e inicio de clases.
- Si una fecha es posterior a hoy, indica que aún no ocurre o cuánto falta (días, semanas o meses).
- Si una fecha es de este mes o muy próxima, NO digas "el próximo año", "el año que viene" ni expresiones que alejen la fecha cuando ya estamos en ese periodo.
- Si una fecha ya pasó, indica que ya ocurrió y orienta al siguiente periodo vigente o a un asesor si aplica.
- Calcula plazos reales respecto a hoy; no inventes referencias temporales incorrectas.
- NUNCA inventes ni confundas el día de la semana (lunes, martes, etc.); usa el día indicado arriba.
- Horario de atención de asesores: lunes a viernes, 8:00 a.m. a 5:00 p.m. (America/Lima).`;
}

/** Appends fresh date context to a base system prompt (hybrid, router, monolithic). */
export function withCurrentDateContext(basePrompt: string, now = new Date()): string {
  return `${basePrompt.trimEnd()}\n\n${buildCurrentDateContext(now)}`;
}
