import { AnimatePresence } from 'framer-motion'
import { ArrowRight, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Alert, Button } from '@/design-system/components'
import { describeAuthError, logout } from '@/services/auth/authService'
import { sceneActions } from '../artwork/sceneStore'
import { ScreenHeader } from '../components/ScreenHeader'
import { Stagger, StaggerItem } from '../components/Stagger'
import { StatusEmblem } from '../components/StatusEmblem'
import { useAuthScreen } from '../hooks/useAuthScreen'
import { sessionActions, useSessionStore } from '../sessionStore'

/**
 * Authenticated hand-off target. The workspace application is out of scope
 * for this phase, so this screen confirms the server session and offers
 * sign-out (which destroys the session server-side).
 */
export function SessionReadyPage() {
  const status = useSessionStore((s) => s.status)
  const session = useSessionStore((s) => s.session)
  // While the session check is in flight, keep the artwork on screen rather than flashing a redirect.
  if (status === 'unknown') return null
  if (status !== 'authenticated' || !session) return <Navigate to="/login" replace />
  return <SessionReady session={session} />
}

function SessionReady({ session }) {
  const headingRef = useAuthScreen({ title: 'Signed in', mode: 'session' })
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState(null)

  const signOut = async () => {
    setSigningOut(true)
    setError(null)
    sceneActions.setStatus('loading')
    try {
      await logout()
      sessionActions.clear()
      navigate('/login', { replace: true })
    } catch (err) {
      // The server session may still be active — say so instead of pretending.
      setError(err)
      setSigningOut(false)
      sceneActions.error()
    }
  }

  const details = [
    { term: 'Account', value: session.user.email },
    { term: 'Workspace', value: session.organization?.name ?? '—' },
    { term: 'Role', value: session.membership?.roleLabel ?? '—' },
    {
      term: 'Session',
      value: session.session.persistent ? 'Kept signed in on this device' : 'Ends when you close the browser',
    },
  ]
  const errorCopy = error ? describeAuthError(error, 'session') : null

  return (
    <Stagger>
      <StaggerItem className="mb-8">
        <StatusEmblem tone="success" />
      </StaggerItem>
      <ScreenHeader ref={headingRef} eyebrow="Session active" tone="success" title="You're signed in">
        Your session is established. Manage your organization's members, invitations and settings.
      </ScreenHeader>

      <AnimatePresence initial={false}>
        {errorCopy && (
          <Alert key="error" tone="danger" title="We couldn't sign you out" className="mb-6">
            {errorCopy.body} You are still signed in.
          </Alert>
        )}
      </AnimatePresence>

      <StaggerItem as="dl" className="divide-y divide-line-subtle rounded-lg bg-surface-raised ring-1 ring-inset ring-line">
        {details.map((row) => (
          <div key={row.term} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="eyebrow shrink-0 text-fg-subtle">{row.term}</dt>
            <dd className="min-w-0 truncate text-label text-fg" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </StaggerItem>

      {session.organization && (
        <StaggerItem className="mt-6">
          <Button fullWidth trailingIcon={<ArrowRight aria-hidden="true" size={17} />} onClick={() => navigate('/organization/members')}>
            Open organization
          </Button>
        </StaggerItem>
      )}

      <StaggerItem className="mt-3">
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
