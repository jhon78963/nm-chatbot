import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import logoLight from '../assets/logo-maritex-light.svg'
import logoDark from '../assets/logo-maritex-dark.svg'

const HERO_IMAGE =
  'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg?auto=compress&cs=tinysrgb&w=1200'

export default function LoginPage() {
  const { login, isAuthenticated, ssoOnly, ssoBootstrapping, ssoError } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ── Theme (light/dark) — default light ─────────────────────
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('dash-theme') as 'light' | 'dark') ?? 'light' }
    catch { return 'light' }
  })
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      try { localStorage.setItem('dash-theme', next) } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  if (ssoBootstrapping) {
    return (
      <section className="login-page" data-theme={theme}>
        <div className="login-container">
          <p className="login-subtitle">Conectando con tu sesión del ERP…</p>
        </div>
      </section>
    )
  }

  if (ssoOnly) {
    return (
      <section className="login-page" data-theme={theme}>
        <div className="login-container">
          <p className="login-subtitle">
            {ssoError ?? 'Accede al chatbot desde el ERP: Aplicaciones → Chatbot.'}
          </p>
        </div>
      </section>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="login-page" data-theme={theme}>
      {/* Theme toggle — top-right corner */}
      <button
        type="button"
        className="login-theme-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      >
        {theme === 'dark' ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM11 1h2v3h-2V1zm0 19h2v3h-2v-3zM3.515 4.929l1.414-1.414 2.121 2.12-1.414 1.415-2.12-2.121zm13.435 13.436 1.414-1.414 2.121 2.12-1.414 1.415-2.121-2.121zM1 13v-2h3v2H1zm19 0v-2h3v2h-3zM4.929 20.485l-1.414-1.414 2.12-2.121 1.415 1.414-2.121 2.121zm13.436-13.435-1.414-1.414 2.12-2.121 1.415 1.414-2.121 2.121z"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
          </svg>
        )}
      </button>

      <div className="login-container">
        <div className="login-grid">
          <div className="login-panel">
            <div className="login-header">
              <div className="login-brand">
                <img
                  src={theme === 'dark' ? logoDark : logoLight}
                  alt="Novedades Maritex"
                  className="login-brand-logo"
                />
              </div>
              <h1 className="login-title">Panel de agentes</h1>
              <p className="login-subtitle">
                Novedades Maritex — WhatsApp Bot Malu
              </p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="username">Usuario</label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="tu.nombre"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Contraseña</label>
                <div className="login-pw-wrap">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="login-pw-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? (
                      /* eye-off */
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      /* eye */
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <button type="submit" className="btn btn-login btn-full" disabled={loading}>
                {loading ? 'Ingresando…' : 'Iniciar sesión'}
              </button>
            </form>
          </div>

          <div className="login-hero" aria-hidden="true">
            <img
              src={HERO_IMAGE}
              alt=""
              className="login-hero-image"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
