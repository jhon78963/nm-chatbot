/** React Router basename — matches Vite `base` (/admin/ in production). */
export const APP_BASENAME = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '/'

export function appPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (APP_BASENAME === '/') return normalized
  return `${APP_BASENAME}${normalized}`
}
