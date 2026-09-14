import { useAuth } from '../auth/AuthContext'
import { RealtimeProvider } from '../context/RealtimeContext'
import DashboardPage from '../pages/DashboardPage'

/** Remounts dashboard when auth session changes (e.g. right after login). */
export default function DashboardShell() {
  const { sessionKey, token } = useAuth()
  if (!token) return <DashboardPage key={sessionKey} />

  return (
    <RealtimeProvider token={token}>
      <DashboardPage key={sessionKey} />
    </RealtimeProvider>
  )
}
