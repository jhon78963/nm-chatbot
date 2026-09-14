import { logger } from '../shared/logger.js';

export type ErpLoginOutcome =
  | { kind: 'success'; accessToken: string }
  | { kind: 'invalid_credentials' }
  | { kind: 'unavailable' };

function resolveAuthServiceBaseUrl(): string | null {
  const raw = process.env['AUTH_SERVICE_URL']?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return null;
}

/**
 * Valida credenciales contra auth-service (mismo login que el panel ERP).
 * POST {base}/auth/login → { access_token }
 */
export async function loginWithAuthService(
  username: string,
  password: string,
): Promise<ErpLoginOutcome> {
  const base = resolveAuthServiceBaseUrl();
  if (!base) return { kind: 'unavailable' };

  const url = `${base}/auth/login`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 401 || res.status === 403) {
      return { kind: 'invalid_credentials' };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('[ERP Auth] Login request failed', { status: res.status, url, body: text.slice(0, 200) });
      return { kind: 'unavailable' };
    }

    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      logger.warn('[ERP Auth] Login response missing access_token', { url });
      return { kind: 'unavailable' };
    }

    return { kind: 'success', accessToken: data.access_token };
  } catch (err) {
    logger.error('[ERP Auth] Login request error', {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'unavailable' };
  }
}
