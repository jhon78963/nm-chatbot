import { isAdminEmbedOnlyEnabled } from '../../infrastructure/http/middlewares/embed-only-admin.middleware.js';

export function isErpSsoOnlyEnabled(): boolean {
  if (process.env['ERP_SSO_ONLY'] === 'true') return true;
  if (process.env['ERP_SSO_ONLY'] === 'false') return false;
  return isAdminEmbedOnlyEnabled();
}

export function resolveErpPanelUrl(): string {
  return (process.env['ADMIN_PANEL_URL'] ?? 'https://app.novedadesmaritex.net.pe').replace(
    /\/$/,
    '',
  );
}
