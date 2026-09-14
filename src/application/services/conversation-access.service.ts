import type { Conversation } from '../../domain/entities/conversation.entity.js';
import type { AgentRole } from '../../domain/entities/agent.entity.js';

export class ForbiddenError extends Error {
  constructor(message = 'Acceso denegado') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Authorization helper: throws ForbiddenError if the given agent is NOT
 * the one assigned to the conversation.
 *
 * Must be called at the start of every use case that operates on a specific
 * conversation — never trust the agentId from the HTTP request body.
 */
export function assertAgentOwnsConversation(
  conversation: Conversation,
  agentId: string,
): void {
  if (conversation.assignedAgentId !== agentId) {
    throw new ForbiddenError('Este chat no está asignado a ti');
  }
}

/** Admins can read any conversation; agents can preview bot-mode or unassigned human chats. */
export function assertCanViewConversation(
  conversation: Conversation,
  agentId: string,
  role: AgentRole = 'agent',
): void {
  if (role === 'admin') return;
  if (conversation.isBotMode()) return;
  if (conversation.isHumanMode() && conversation.assignedAgentId === null) return;
  assertAgentOwnsConversation(conversation, agentId);
}
