import { AnimatePresence } from 'framer-motion'
import { ArrowRight, LogIn, LogOut, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Alert, Button } from '@/design-system/components'
import { sceneActions } from '@/features/auth/artwork/sceneStore'
import { BackLink } from '@/features/auth/components/BackLink'
import { ScreenHeader } from '@/features/auth/components/ScreenHeader'
import { Stagger, StaggerItem } from '@/features/auth/components/Stagger'
import { StatusEmblem } from '@/features/auth/components/StatusEmblem'
import { useAuthScreen } from '@/features/auth/hooks/useAuthScreen'
import { sessionActions, useSessionStore } from '@/features/auth/sessionStore'
import { AUTH_ERROR } from '@/services/auth/authErrors'
import { logout } from '@/services/auth/authService'
import { acceptInvitation, inspectInvitation, paced } from '@/services/organization/organizationApi'
import { describeOrganizationError, ORG_ERROR } from '@/services/organization/organizationErrors'

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' })

/**
 * Invitation link target (/invite?token=…), inside the auth layout so the
 * Perimeter artwork carries through. Checking the link doesn't use it up;
 * accepting requires signing in with the invited email address.
 *
 * view: checking | ready | invalid | expired | unavailable | accepted
 */
export function InvitationPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const headingRef = useAuthScreen({ title: 'Invitation', mode: 'verify' })
  const [check, setCheck] = useState({ token: null, view: 'checking', invitation: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    paced(inspectInvitation(token), 700).then(
      ({ invitation }) => active && setCheck({ token, view: 'ready', invitation, error: null }),
      (error) => {
        if (!active) return
        const view =
          error.code === AUTH_ERROR.TOKEN_EXPIRED
            ? 'expired'
            : error.code === AUTH_ERROR.TOKEN_INVALID || error.code === AUTH_ERROR.VALIDATION
              ? 'invalid'
              : 'unavailable'
        if (view !== 'unavailable') sceneActions.error()
        setCheck({ token, view, invitation: null, error })
      },
    )
    return () => {
      active = false
    }
  }, [token, attempt])

  const view = check.token === token ? check.view : 'checking'
  const retry = () => {
    setCheck((c) => ({ ...c, token: null }))
    setAttempt((n) => n + 1)
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Stagger key={view === 'ready' ? 'ready' : view}>
        {view === 'checking' && (
          <>
            <StaggerItem className="mb-8">
              <StatusEmblem tone="progress" />
            </StaggerItem>
            <ScreenHeader ref={headingRef} eyebrow="Invitation" title="Checking your invitation">
              This only takes a moment.
            </ScreenHeader>
            <p className="sr-only" role="status">
              Checking invitation link
            </p>
          </>
        )}

        {view === 'invalid' && (
          <LinkProblem
            headingRef={headingRef}
            tone="failure"
            eyebrow="Link not valid"
            title="This invitation link isn't valid"
            body="It may have been used already, revoked, or replaced by a newer invitation. Ask an admin of the organization to send a new one."
          />
        )}

        {view === 'expired' && (
          <LinkProblem
            headingRef={headingRef}
            tone="expired"
            eyebrow="Link expired"
            title="This invitation has expired"
            body="Invitations are valid for 7 days. Ask an admin of the organization to resend it."
          />
        )}

        {view === 'unavailable' && (
          <>
            <StaggerItem className="mb-8">
              <StatusEmblem tone="failure" />
            </StaggerItem>
            <ScreenHeader
              ref={headingRef}
              eyebrow={check.error?.code === AUTH_ERROR.RATE_LIMITED ? 'Too many attempts' : 'Connection'}
              tone="danger"
              title="We couldn't check your invitation"
            >
              {describeOrganizationError(check.error).body}
            </ScreenHeader>
            <StaggerItem className="space-y-3">
              <Button fullWidth onClick={retry}>
                Try again
              </Button>
            </StaggerItem>
          </>
        )}

        {view === 'ready' && <ReadyInvitation token={token} invitation={check.invitation} headingRef={headingRef} onLinkProblem={(next) => setCheck((c) => ({ ...c, view: next }))} />}
      </Stagger>
    </AnimatePresence>
  )
}

function LinkProblem({ headingRef, tone, eyebrow, title, body }) {
  return (
    <>
      <BackLink />
      <StaggerItem className="mb-8">
        <StatusEmblem tone={tone} />
      </StaggerItem>
      <ScreenHeader ref={headingRef} eyebrow={eyebrow} tone={tone === 'expired' ? 'warning' : 'danger'} title={title}>
        {body}
      </ScreenHeader>
    </>
  )
}

function ReadyInvitation({ token, invitation, headingRef, onLinkProblem }) {
  const navigate = useNavigate()
  const status = useSessionStore((s) => s.status)
  const session = useSessionStore((s) => s.session)
  const [phase, setPhase] = useState('idle') // idle | accepting | accepted | signing-out
  const [error, setError] = useState(null)

  const invitePath = `/invite?token=${encodeURIComponent(token)}`
  const signedInEmail = session?.user.email ?? ''
  const emailMatches = signedInEmail.toLowerCase() === invitation.email.toLowerCase()
  const alreadyMember = session?.memberships?.some((m) => m.organization.id === invitation.organization.id)

  const accept = async () => {
    setPhase('accepting')
    setError(null)
    sceneActions.setStatus('loading')
    try {
      const next = await paced(acceptInvitation(token), 900)
      sceneActions.setStatus('success')
      setPhase('accepted')
      sessionActions.establish(next)
    } catch (err) {
      setPhase('idle')
      sceneActions.error()
      if (err.code === AUTH_ERROR.TOKEN_EXPIRED) return onLinkProblem('expired')
      if (err.code === AUTH_ERROR.TOKEN_INVALID) return onLinkProblem('invalid')
      if (err.code === AUTH_ERROR.UNAUTHENTICATED) sessionActions.expire()
      if (err.code === ORG_ERROR.ALREADY_MEMBER) sessionActions.refresh()
      setError(err)
    }
  }

  const switchAccount = async () => {
    setPhase('signing-out')
    try {
      await logout()
      sessionActions.expire()
      navigate(`/login?next=${encodeURIComponent(invitePath)}`)
    } catch (err) {
      setPhase('idle')
      setError(err)
    }
  }

  const summary = (
    <StaggerItem as="dl" className="mb-8 divide-y divide-line-subtle rounded-lg bg-surface-raised ring-1 ring-inset ring-line">
      {[
        { term: 'Organization', value: invitation.organization.name },
        { term: 'Role', value: invitation.roleLabel },
        { term: 'Invited email', value: invitation.email },
        { term: 'Expires', value: dateFormat.format(new Date(invitation.expiresAt)) },
      ].map((row) => (
        <div key={row.term} className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="eyebrow shrink-0 text-fg-subtle">{row.term}</dt>
          <dd className="min-w-0 truncate text-label text-fg" title={row.value}>
            {row.value}
          </dd>
        </div>
      ))}
    </StaggerItem>
  )

  if (phase === 'accepted') {
    return (
      <>
        <StaggerItem className="mb-8">
          <StatusEmblem tone="success" />
        </StaggerItem>
        <ScreenHeader eyebrow="Access granted" tone="success" title={`Welcome to ${invitation.organization.name}`} focusOnMount>
          You joined as {invitation.roleLabel}. It's now your current organization.
        </ScreenHeader>
        <StaggerItem>
          <Button fullWidth trailingIcon={<ArrowRight aria-hidden="true" size={17} />} onClick={() => navigate('/organization')}>
            Open organization
          </Button>
        </StaggerItem>
      </>
    )
  }

  const errorCopy =
    error && error.code !== ORG_ERROR.INVITATION_EMAIL_MISMATCH ? describeOrganizationError(error, 'accept this invitation') : null
  const mismatch = status === 'authenticated' && (!emailMatches || error?.code === ORG_ERROR.INVITATION_EMAIL_MISMATCH)
  const invitedBy = invitation.invitedBy?.fullName

  return (
    <>
      <StaggerItem className="mb-8">
        <StatusEmblem tone="pending" />
      </StaggerItem>
      <ScreenHeader ref={headingRef} eyebrow="Invitation" title={`Join ${invitation.organization.name}`}>
        {invitedBy ? `${invitedBy} invited you` : 'You were invited'} to join as {invitation.roleLabel}.
      </ScreenHeader>

      <AnimatePresence initial={false}>
        {errorCopy && (
          <Alert key="error" tone="danger" title={errorCopy.title} className="mb-6">
            {errorCopy.body}
          </Alert>
        )}
      </AnimatePresence>

      {summary}

      {status === 'unknown' && <p className="sr-only" role="status">Checking your session</p>}

      {status === 'anonymous' && (
        <StaggerItem className="space-y-3">
          <Button
            fullWidth
            leadingIcon={<LogIn aria-hidden="true" size={17} />}
            onClick={() => navigate(`/login?next=${encodeURIComponent(invitePath)}`)}
          >
            Sign in to accept
          </Button>
          <Button variant="secondary" fullWidth leadingIcon={<UserPlus aria-hidden="true" size={17} />} onClick={() => navigate('/signup')}>
            Create an account
          </Button>
          <p className="pt-2 text-caption text-fg-subtle">
            Use <span className="text-fg-muted">{invitation.email}</span>. New accounts must verify their email first — then open
            this invitation link again.
          </p>
        </StaggerItem>
      )}

      {status === 'authenticated' && !mismatch && alreadyMember && (
        <StaggerItem className="space-y-3">
          <Alert tone="info" title="You're already a member" className="mb-3">
            This account already belongs to {invitation.organization.name}.
          </Alert>
          <Button fullWidth trailingIcon={<ArrowRight aria-hidden="true" size={17} />} onClick={() => navigate('/organization')}>
            Open organization
          </Button>
        </StaggerItem>
      )}

      {status === 'authenticated' && !mismatch && !alreadyMember && (
        <StaggerItem className="space-y-3">
          <Button fullWidth loading={phase === 'accepting'} loadingLabel="Joining…" onClick={accept}>
            Accept invitation
          </Button>
          <Button variant="ghost" fullWidth disabled={phase === 'accepting'} onClick={() => navigate('/session')}>
            Not now
          </Button>
          <p className="sr-only" role="status">
            {phase === 'accepting' ? 'Accepting invitation' : ''}
          </p>
        </StaggerItem>
      )}

      {mismatch && (
        <StaggerItem className="space-y-3">
          <Alert tone="warning" title="This invitation is for a different email" className="mb-3">
            You're signed in as <span className="text-fg">{signedInEmail}</span>. Sign in with {invitation.email} to accept it.
          </Alert>
          <Button
            fullWidth
            loading={phase === 'signing-out'}
            loadingLabel="Signing out…"
            leadingIcon={<LogOut aria-hidden="true" size={16} />}
            onClick={switchAccount}
          >
            Sign out and switch account
          </Button>
          <Button variant="ghost" fullWidth onClick={() => navigate('/session')}>
            Back to my session
          </Button>
        </StaggerItem>
      )}
    </>
  )
}
