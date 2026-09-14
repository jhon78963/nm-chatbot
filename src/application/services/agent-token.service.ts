import jwt from 'jsonwebtoken';
import type { Agent } from '../../domain/entities/agent.entity.js';

export interface AgentJwtClaims {
  sub: string;
  username: string;
  name: string;
  role: string;
}

export function signAgentToken(agent: Agent, expiresIn?: string | number): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  const props = agent.toProps();
  const username = props.username ?? props.email.split('@')[0] ?? props.id;
  const ttl = expiresIn ?? process.env['JWT_EXPIRES_IN'] ?? '15m';

  return jwt.sign(
    {
      sub: props.id,
      username,
      name: props.name,
      role: props.role,
    } satisfies AgentJwtClaims,
    secret,
    { expiresIn: ttl } as jwt.SignOptions,
  );
}
