import type { Request, Response, NextFunction } from 'express';

function resolveErpChatbotUrl(): string {
  const base = (process.env['ADMIN_PANEL_URL'] ?? 'https://app.novedadesmaritex.net.pe').replace(
    /\/$/,
    '',
  );
  return `${base}/chatbot`;
}

function resolveErpHostname(): string {
  try {
    return new URL(process.env['ADMIN_PANEL_URL'] ?? 'https://app.novedadesmaritex.net.pe')
      .hostname;
  } catch {
    return 'app.novedadesmaritex.net.pe';
  }
}

/** When true (default in production), admin HTML is only served inside the ERP iframe. */
export function isAdminEmbedOnlyEnabled(): boolean {
  if (process.env['ADMIN_EMBED_ONLY'] === 'false') return false;
  if (process.env['NODE_ENV'] !== 'production') return false;
  return true;
}

export function redirectToErpChatbot(res: Response): void {
  res.redirect(302, resolveErpChatbotUrl());
}

/** Allow static assets; block top-level navigation to the SPA outside the ERP iframe. */
export function isEmbeddedAdminRequest(req: Request): boolean {
  if (!isAdminEmbedOnlyEnabled()) return true;

  const fetchDest = req.headers['sec-fetch-dest'];
  if (fetchDest === 'iframe') return true;

  const referer = req.headers['referer'];
  if (referer) {
    try {
      const refererHost = new URL(referer).hostname;
      if (refererHost === resolveErpHostname()) return true;
    } catch {
      /* ignore malformed referer */
    }
  }

  return false;
}

export function isAdminHtmlNavigation(req: Request): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  // express.static uses extension; SPA navigations do not.
  return !/\.[a-z0-9]+$/i.test(req.path);
}

/** CSP: only the ERP (and same-origin) may embed the admin panel. */
export function setAdminFrameAncestors(res: Response): void {
  const erpOrigin = (process.env['ADMIN_PANEL_URL'] ?? 'https://app.novedadesmaritex.net.pe').replace(
    /\/$/,
    '',
  );
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${erpOrigin}`);
}

export function embedOnlyAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  setAdminFrameAncestors(res);

  if (!isAdminEmbedOnlyEnabled()) {
    next();
    return;
  }

  if (isAdminHtmlNavigation(req) && !isEmbeddedAdminRequest(req)) {
    redirectToErpChatbot(res);
    return;
  }

  next();
}
