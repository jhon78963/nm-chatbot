import type { Agent } from '../../domain/entities/agent.entity.js';

const DEFAULT_ASSIGNED_MSG =
  '¡Listo! Te asigné a {agentName}, asesor/a de Maritex. En un momento continúa contigo por este chat.\n\n' +
  'Si necesitas contactarle directamente: {agentWhatsapp}\n\n' +
  'Horario de atención: lunes a sábado, consulta en nuestra tienda online.';

const DEFAULT_PENDING_MSG =
  'Perfecto, te estoy derivando con nuestro equipo de Maritex. Un asesor te contactará en breve por este mismo chat.\n\n' +
  'Tienda: https://novedadesmaritex.net.pe';

/** Formats E.164 for display in Peru (e.g. +51915974331 → +51 915 974 331). */
export function formatAgentWhatsappForDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('51') && digits.length === 11) {
    return `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return e164.startsWith('+') ? e164 : `+${digits}`;
}

export function buildHandoffAssignedLeadMessage(agent: Agent): string {
  const template = process.env['HANDOFF_TRANSITION_MESSAGE'] ?? DEFAULT_ASSIGNED_MSG;
  const firstName = agent.name.trim().split(/\s+/)[0] ?? agent.name;
  return template
    .replaceAll('{agentName}', agent.name)
    .replaceAll('{agentFirstName}', firstName)
    .replaceAll('{agentWhatsapp}', formatAgentWhatsappForDisplay(agent.whatsapp));
}

export function buildHandoffPendingLeadMessage(): string {
  return process.env['HANDOFF_PENDING_MESSAGE'] ?? DEFAULT_PENDING_MSG;
}

export function appendCartHandoffDeepLink(
  message: string,
  handoffUrl: string,
  sessionId: string,
): string {
  if (message.includes('{cartHandoffUrl}') || message.includes('{cartSessionId}')) {
    return message
      .replaceAll('{cartHandoffUrl}', handoffUrl)
      .replaceAll('{cartSessionId}', sessionId);
  }

  return (
    `${message.trim()}\n\n` +
    `Para concretar tu pedido con un asesor, toca este enlace:\n${handoffUrl}`
  );
}
