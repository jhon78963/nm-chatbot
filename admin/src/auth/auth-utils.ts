export interface AgentInfo {
  id: string
  name: string
  username: string
  email: string
  role: 'agent' | 'admin'
}

export function roleFromJwt(token: string | null | undefined): 'agent' | 'admin' | null {
  if (!token) return null
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: string
    }
    if (payload.role === 'admin') return 'admin'
    if (payload.role === 'agent') return 'agent'
    return null
  } catch {
    return null
  }
}

/** Ensures agent.role is set (JWT fallback for sessions saved before role existed). */
export function normalizeAgent(
  agent: AgentInfo | null,
  token: string | null,
): AgentInfo | null {
  if (!agent) return null
  if (agent.role === 'admin' || agent.role === 'agent') return agent
  const role = roleFromJwt(token) ?? 'agent'
  return { ...agent, role }
}

export function resolveIsAdmin(agent: AgentInfo | null, token: string | null): boolean {
  const normalized = normalizeAgent(agent, token)
  return normalized?.role === 'admin'
}
