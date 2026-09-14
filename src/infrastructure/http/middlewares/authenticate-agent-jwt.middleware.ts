import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';

export interface AgentJwtPayload {
  sub: string;
  username: string;
  name: string;
  role?: AgentRole;
}

function extractBearerOrQueryToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const queryToken = req.query['token'];
  return typeof queryToken === 'string' && queryToken.length > 0 ? queryToken : null;
}

export function authenticateAgentJwt(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerOrQueryToken(req);
  if (!token) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return;
  }
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AgentJwtPayload;
    req.agent = {
      id: payload.sub,
      username: payload.username,
      name: payload.name,
      role: payload.role ?? 'agent',
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
