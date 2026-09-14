import type { Request } from 'express';
import { logger } from './logger.service.js';

export type AgentAuditAction =
  | 'login_success'
  | 'login_failed'
  | 'sso_erp_success'
  | 'sso_erp_failed'
  | 'logout'
  | 'message_sent'
  | 'conversation_assigned'
  | 'conversation_reassigned'
  | 'return_to_bot'
  | 'conversation_closed'
  | 'access_denied';

export interface AgentAuditFields {
  action: AgentAuditAction;
  agentId?: string;
  agentUsername?: string;
  agentName?: string;
  contactName?: string;
  conversationId?: string;
  phoneNumber?: string;
  handoffBy?: string;
  detail?: string;
  ip?: string;
  contentPreview?: string;
}

const ACTION_LABELS: Record<AgentAuditAction, string> = {
  login_success: 'Inicio de sesión',
  login_failed: 'Login fallido',
  sso_erp_success: 'SSO ERP exitoso',
  sso_erp_failed: 'SSO ERP fallido',
  logout: 'Cierre de sesión',
  message_sent: 'Mensaje enviado',
  conversation_assigned: 'Chat asignado a asesor',
  conversation_reassigned: 'Chat reasignado',
  return_to_bot: 'Devuelto al bot',
  conversation_closed: 'Conversación cerrada',
  access_denied: 'Acceso denegado',
};

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const ip = forwarded.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Structured audit trail for advisor actions — indexed in Grafana via logType=agent_audit. */
export function logAgentAudit(fields: AgentAuditFields): void {
  const label = ACTION_LABELS[fields.action];
  logger.info(`[AgentAudit] ${label}`, {
    logType: 'agent_audit',
    ...fields,
  });
}

export function logAgentAuditFromRequest(
  req: Request,
  action: AgentAuditAction,
  extra: Omit<AgentAuditFields, 'action'> = {},
): void {
  const fields: AgentAuditFields = {
    action,
    ip: clientIp(req),
    ...extra,
  };
  if (req.agent?.id) fields.agentId = req.agent.id;
  if (req.agent?.username) fields.agentUsername = req.agent.username;
  if (req.agent?.name) fields.agentName = req.agent.name;
  logAgentAudit(fields);
}
