import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, ssoBootstrapping, ssoError, ssoOnly } = useAuth()

  if (ssoBootstrapping) {
    return (
      <div className="sso-bootstrap">
        <p>Conectando con tu sesión del ERP…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    if (ssoOnly || ssoError) {
      return (
        <div className="sso-bootstrap sso-bootstrap--error">
          <p>{ssoError ?? 'Inicia sesión en el ERP y abre el chatbot desde Aplicaciones.'}</p>
        </div>
      )
    }
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
