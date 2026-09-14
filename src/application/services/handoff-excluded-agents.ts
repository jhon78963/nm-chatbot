/** Usernames excluded from automatic handoff and manual take (test accounts). */
export function getHandoffExcludedUsernames(): Set<string> {
  const raw = process.env['HANDOFF_EXCLUDED_AGENT_USERNAMES'] ?? 'zero.dev';
  return new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

/** When set, all automatic handoffs assign this agent (ERP username in chat_agents). */
export function getHandoffAssignAgentUsername(): string | null {
  const raw = process.env['HANDOFF_ASSIGN_AGENT_USERNAME']?.trim().toLowerCase();
  return raw || null;
}

export function isHandoffExcludedAgent(username: string | null | undefined): boolean {
  if (!username) return false;
  return getHandoffExcludedUsernames().has(username.toLowerCase());
}
