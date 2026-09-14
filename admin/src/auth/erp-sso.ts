const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export interface AuthConfig {
  ssoOnly: boolean
  erpPanelUrl: string
}

let cachedConfig: AuthConfig | null = null

export async function fetchAuthConfig(): Promise<AuthConfig> {
  if (cachedConfig) return cachedConfig

  const res = await fetch(`${BASE}/api/v1/auth/config`)
  if (!res.ok) {
    cachedConfig = {
      ssoOnly: false,
      erpPanelUrl: import.meta.env.VITE_ERP_PANEL_URL ?? 'https://app.novedadesmaritex.net.pe',
    }
    return cachedConfig
  }

  cachedConfig = (await res.json()) as AuthConfig
  return cachedConfig
}

export function isEmbeddedInErp(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function resolveErpPanelOrigin(config: AuthConfig): string {
  return new URL(config.erpPanelUrl).origin
}

export async function exchangeErpToken(erpToken: string): Promise<{
  token: string
  agent: import('./auth-utils').AgentInfo
}> {
  const res = await fetch(`${BASE}/api/v1/auth/sso-erp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${erpToken}`,
    },
    body: JSON.stringify({ token: erpToken }),
  })

  const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
    token?: string
    agent?: import('./auth-utils').AgentInfo
    error?: string
  }

  if (!res.ok) {
    throw new Error(body.error ?? 'No se pudo iniciar sesión con el ERP')
  }

  if (!body.token || !body.agent) {
    throw new Error('Respuesta SSO inválida')
  }

  return { token: body.token, agent: body.agent }
}

export function notifyErpSsoReady(config: AuthConfig): void {
  if (!isEmbeddedInErp()) return
  window.parent.postMessage({ type: 'nm-chatbot-sso-ready' }, resolveErpPanelOrigin(config))
}

export function listenForErpSsoToken(
  config: AuthConfig,
  onToken: (token: string) => void,
  onLogout?: () => void,
): () => void {
  const erpOrigin = resolveErpPanelOrigin(config)

  const handler = (event: MessageEvent) => {
    if (event.origin !== erpOrigin) return
    const data = event.data as { type?: string; token?: string } | null
    if (data?.type === 'nm-chatbot-sso' && typeof data.token === 'string' && data.token) {
      onToken(data.token)
      return
    }
    if (data?.type === 'nm-chatbot-sso-logout') {
      onLogout?.()
    }
  }

  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}
