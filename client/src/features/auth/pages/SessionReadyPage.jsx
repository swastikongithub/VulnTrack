import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Button } from '@/design-system/components'
import { logout } from '@/services/auth/authService'
import { sceneActions } from '../artwork/sceneStore'
import { ScreenHeader } from '../components/ScreenHeader'
import { Stagger, StaggerItem } from '../components/Stagger'
import { StatusEmblem } from '../components/StatusEmblem'
import { useAuthScreen } from '../hooks/useAuthScreen'
import { sessionActions, useSessionStore } from '../sessionStore'

/**
 * Authenticated hand-off target. The workspace application is out of scope
 * for this phase, so this screen confirms the session and offers sign-out
 * (exercising the logout / invalidation flow).
 */
export function SessionReadyPage() {
  const session = useSessionStore((s) => s.session)
  if (!session) return <Navigate to="/login" replace />
  return <SessionReady session={session} />
}

function SessionReady({ session }) {
  const headingRef = useAuthScreen({ title: 'Signed in', mode: 'session' })
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    sceneActions.setStatus('loading')
    await logout()
    sessionActions.clear()
    navigate('/login', { replace: true })
  }

  const details = [
    { term: 'Account', value: session.email },
    { term: 'Role', value: session.role },
    { term: 'Session', value: session.persistent ? 'Kept signed in on this device' : 'Ends when you close the browser' },
  ]

  return (
    <Stagger>
      <StaggerItem className="mb-8">
        <StatusEmblem tone="success" />
      </StaggerItem>
      <ScreenHeader ref={headingRef} eyebrow="Session active" tone="success" title="You're signed in">
        Your session is established. The workspace console is not part of this build yet.
      </ScreenHeader>

      <StaggerItem as="dl" className="divide-y divide-line-subtle rounded-lg bg-surface-raised ring-1 ring-inset ring-line">
        {details.map((row) => (
          <div key={row.term} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="eyebrow text-fg-subtle">{row.term}</dt>
            <dd className="min-w-0 truncate text-label text-fg" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </StaggerItem>

      <StaggerItem className="mt-6">
        <Button
          variant="secondary"
          fullWidth
          loading={signingOut}
          loadingLabel="Signing out…"
          leadingIcon={<LogOut aria-hidden="true" size={16} />}
          onClick={signOut}
        >
          Sign out
        </Button>
      </StaggerItem>
      <p className="sr-only" role="status">
        {signingOut ? 'Signing out' : ''}
      </p>
    </Stagger>
  )
}
