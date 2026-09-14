const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

let cachedAuthConfig: { ssoOnly: boolean; erpPanelUrl: string } | null = null

async function resolveAuthConfig(): Promise<{ ssoOnly: boolean; erpPanelUrl: string }> {
  if (cachedAuthConfig) return cachedAuthConfig
  try {
    const res = await fetch(`${BASE}/api/v1/auth/config`)
    if (res.ok) {
      cachedAuthConfig = (await res.json()) as { ssoOnly: boolean; erpPanelUrl: string }
      return cachedAuthConfig
    }
  } catch {
    /* ignore */
  }
  cachedAuthConfig = {
    ssoOnly: false,
    erpPanelUrl: import.meta.env.VITE_ERP_PANEL_URL ?? 'https://app.novedadesmaritex.net.pe',
  }
  return cachedAuthConfig
}

export interface ApiError {
  error: string
  status: number
}

import { appPath } from '../router/basename'

export function getToken(): string | null {
  return localStorage.getItem('uprit_agent_token')
}

/** Append JWT query param for GET /media (img/audio/video cannot send Authorization header). */
export function resolveMediaUrl(mediaUrl: string): string {
  if (!mediaUrl.startsWith('/media/')) return mediaUrl
  const token = getToken()
  if (!token) return mediaUrl
  const sep = mediaUrl.includes('?') ? '&' : '?'
  return `${BASE}${mediaUrl}${sep}token=${encodeURIComponent(token)}`
}

/** Build WebSocket URL for /api/v1/ws with JWT query param. */
export function getWebSocketUrl(token: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  if (base) {
    const url = new URL(base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/api/v1/ws'
    url.search = `token=${encodeURIComponent(token)}`
    return url.toString()
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/v1/ws?token=${encodeURIComponent(token)}`
}

function logout(): void {
  localStorage.removeItem('uprit_agent_token')
  void resolveAuthConfig().then((config) => {
    if (config.ssoOnly) {
      try {
        window.parent.postMessage(
          { type: 'nm-chatbot-sso-expired' },
          new URL(config.erpPanelUrl).origin,
        )
      } catch {
        /* ignore */
      }
      return
    }
    window.location.href = appPath('/login')
  })
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    logout()
    throw new Error('Sesión expirada. Inicia sesión de nuevo.')
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
    const err = new Error(body.error ?? res.statusText) as Error & { status: number }
    err.status = res.status
    throw err
  }

  return res.json() as Promise<T>
}

async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (res.status === 401) {
    logout()
    throw new Error('Sesión expirada. Inicia sesión de nuevo.')
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
    const err = new Error(body.error ?? res.statusText) as Error & { status: number }
    err.status = res.status
    throw err
  }

  return res.json() as Promise<T>
}

export const api = {
  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  },
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'GET' })
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  },
  del<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },
  postFormData<T>(path: string, formData: FormData): Promise<T> {
    return requestFormData<T>(path, formData)
  },
}

export { logout }
