import { setInterval } from 'node:timers';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/logger.js';

interface BucketEntry {
  count: number;
  resetAt: number;
}

/**
 * Rate limiter por IP en memoria (sin dependencias externas).
 *
 * Usa ventana fija: cada IP tiene un bucket que se resetea cada `windowMs`.
 * Si supera `max` peticiones en la ventana → 429.
 *
 * Diseñado para rutas de autenticación (/auth/login, /auth/sso-erp) donde
 * el volumen esperado es muy bajo (pocos agentes, no tráfico de usuarios finales).
 */
export function createIpRateLimiter(opts: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const { windowMs, max, message = 'Demasiados intentos. Intenta más tarde.' } = opts;
  const buckets = new Map<string, BucketEntry>();

  // Limpieza periódica para evitar memory leak con IPs únicas
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(ip);
    }
  }, windowMs * 2).unref();

  return function ipRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';

    const now = Date.now();
    let entry = buckets.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs };
      buckets.set(ip, entry);
    } else {
      entry.count += 1;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      logger.warn('[RateLimit] IP bloqueada por exceso de peticiones a auth', {
        ip,
        count: entry.count,
        path: req.path,
      });
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

/**
 * 10 intentos por IP cada 15 minutos en rutas de autenticación.
 * Suficiente para un agente legítimo; disuasivo para fuerza bruta.
 */
export const authRateLimiter = createIpRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.',
});
