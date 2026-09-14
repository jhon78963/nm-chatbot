import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { api, logout as apiLogout } from '../api/client'
import {
  exchangeErpToken,
  fetchAuthConfig,
  isEmbeddedInErp,
  listenForErpSsoToken,
  notifyErpSsoReady,
  type AuthConfig,
} from './erp-sso'
import { normalizeAgent, resolveIsAdmin, type AgentInfo } from './auth-utils'

export type { AgentInfo }

interface AuthState {
  token: string | null
  agent: AgentInfo | null
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  isAdmin: boolean
  ssoOnly: boolean
  ssoBootstrapping: boolean
  ssoError: string | null
  /** Bumps on each login so routed views remount with fresh auth-derived UI. */
  sessionKey: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadInitialState(): AuthState {
  const token = localStorage.getItem('uprit_agent_token')
  const raw = localStorage.getItem('uprit_agent_info')
  const parsed = raw ? (JSON.parse(raw) as AgentInfo) : null
  const agent = normalizeAgent(parsed, token)
  if (agent && raw && parsed && !parsed.role && agent.role) {
    localStorage.setItem('uprit_agent_info', JSON.stringify(agent))
  }
  return { token, agent }
}

function persistSession(token: string, agent: AgentInfo): void {
  localStorage.setItem('uprit_agent_token', token)
  localStorage.setItem('uprit_agent_info', JSON.stringify(agent))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitialState)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)
  const [ssoBootstrapping, setSsoBootstrapping] = useState(() => !loadInitialState().token)
  const [ssoError, setSsoError] = useState<string | null>(null)
  const [sessionKey, setSessionKey] = useState(() =>
    state.token ? `${state.token.slice(-12)}:${state.agent?.id ?? ''}` : 'anon',
  )

  const applySession = useCallback((token: string, agent: AgentInfo) => {
    persistSession(token, agent)
    flushSync(() => {
      setState({ token, agent })
      setSessionKey(`${token.slice(-12)}:${agent.id}:${agent.role}`)
      setSsoError(null)
      setSsoBootstrapping(false)
    })
  }, [])

  const clearSession = useCallback((notifyServer = true) => {
    const token = localStorage.getItem('uprit_agent_token')
    if (notifyServer && token) {
      void fetch(`${(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => void 0)
    }
    localStorage.removeItem('uprit_agent_token')
    localStorage.removeItem('uprit_agent_info')
    setState({ token: null, agent: null })
    setSessionKey('anon')
    setSsoBootstrapping(false)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<{ token: string; agent: AgentInfo }>('/api/v1/auth/login', {
      username,
      password,
    })
    const agent = normalizeAgent(data.agent, data.token)
    if (!agent) throw new Error('Respuesta de login inválida')
    applySession(data.token, agent)
  }, [applySession])

  const logout = useCallback(() => {
    clearSession(true)
    apiLogout()
  }, [clearSession])

  useEffect(() => {
    let cancelled = false
    let stopListening: (() => void) | undefined

    void fetchAuthConfig().then((config) => {
      if (cancelled) return
      setAuthConfig(config)

      const tryExchange = async (erpToken: string) => {
        try {
          const result = await exchangeErpToken(erpToken)
          const agent = normalizeAgent(result.agent, result.token)
          if (!agent) throw new Error('Respuesta SSO inválida')
          applySession(result.token, agent)
        } catch (err) {
          if (!cancelled) {
            setSsoError(err instanceof Error ? err.message : 'Error al iniciar sesión con el ERP')
            setSsoBootstrapping(false)
            clearSession(false)
          }
        }
      }

      stopListening = listenForErpSsoToken(
        config,
        (erpToken) => {
          void tryExchange(erpToken)
        },
        () => {
          if (!cancelled) {
            clearSession(true)
            setSsoError('Sesión del ERP cerrada. Vuelve a iniciar sesión en el ERP.')
          }
        },
      )

      if (state.token) {
        setSsoBootstrapping(false)
        notifyErpSsoReady(config)
        return
      }

      const shouldBootstrapSso = config.ssoOnly || isEmbeddedInErp()
      if (!shouldBootstrapSso) {
        setSsoBootstrapping(false)
        return
      }

      notifyErpSsoReady(config)
    })

    return () => {
      cancelled = true
      stopListening?.()
    }
  }, [applySession, clearSession, state.token])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        isAuthenticated: state.token !== null,
        isAdmin: resolveIsAdmin(state.agent, state.token),
        ssoOnly: authConfig?.ssoOnly ?? false,
        ssoBootstrapping,
        ssoError,
        sessionKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
