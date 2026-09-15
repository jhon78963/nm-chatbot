import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AgentRole } from '../../../domain/entities/agent.entity.js';

export interface AgentJwtPayload {
  sub: string;
  username: string;
  name: string;
  role?: AgentRole;
}

/**
 * Extrae el token SOLO desde el header Authorization: Bearer <token>.
 * El query param ?token= NO se acepta en rutas HTTP para evitar que el JWT
 * quede expuesto en logs de servidor, Cloudflare y historial del browser.
 * El WebSocket sí usa ?token= en el handshake inicial (websocket-realtime.adapter.ts),
 * lo cual es el comportamiento estándar ya que los browsers no envían headers en WS.
 */
function extractBearerOrQueryToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
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
