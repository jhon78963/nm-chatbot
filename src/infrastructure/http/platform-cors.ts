export function parsePlatformPublicDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '');
  if (!value || !value.includes('.')) return null;
  return value;
}

/** Un label bajo PLATFORM_PUBLIC_DOMAIN: acme.zerogroups.net.pe */
export function isPlatformSubdomainOrigin(
  origin: string,
  platformDomain: string | null | undefined,
): boolean {
  const domain = parsePlatformPublicDomain(platformDomain);
  if (!domain) return false;

  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    const suffix = `.${domain}`;
    if (!host.endsWith(suffix)) return false;
    const prefix = host.slice(0, -suffix.length);
    return prefix.length > 0 && !prefix.includes('.') && /^[a-z0-9-]+$/.test(prefix);
  } catch {
    return false;
  }
}
