import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Mail } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { Alert, Button, Checkbox, PasswordField, TextField, TextLink } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { AUTH_ERROR, describeAuthError, login } from '@/services/auth/authService'
import { sceneActions } from '../artwork/sceneStore'
import { ScreenHeader } from '../components/ScreenHeader'
import { SessionHandoff } from '../components/SessionHandoff'
import { Stagger, StaggerItem } from '../components/Stagger'
import { useAuthForm } from '../hooks/useAuthForm'
import { formatSeconds, useAuthScreen, useCountdown, usePreviewFill } from '../hooks/useAuthScreen'
import { safeNextPath } from '@/lib/safeRedirect'
import { sessionActions, sessionStore, useSessionStore } from '../sessionStore'
import { validateEmail, validateLoginPassword } from '../validation/validators'

const INITIAL = { email: '', password: '', remember: true }

export function LoginPage() {
  const headingRef = useAuthScreen({ title: 'Sign in', mode: 'login' })
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Snapshot at mount, then acknowledge — the notice shows once per sign-out
  const [signedOut] = useState(() => sessionStore.getState().signedOut)
  const alreadySignedIn = useSessionStore((s) => s.status === 'authenticated')
  const [authError, setAuthError] = useState(null)
  const [phase, setPhase] = useState('form') // form | success | handoff
  const [retryIn, setRetryIn] = useCountdown()
  const [lockedEmail, setLockedEmail] = useState(null)
  const sessionRef = useRef(null)
  const passwordChanged = searchParams.get('reset') === 'success'
  // Where to go after signing in (allowlisted in-app paths only, e.g. an invitation link).
  const destination = safeNextPath(searchParams.get('next')) ?? '/session'

  const form = useAuthForm({
    initialValues: INITIAL,
    validate: (v) => ({ email: validateEmail(v.email), password: validateLoginPassword(v.password) }),
    onSubmit: async (values) => {
      setAuthError(null)
      try {
        const result = await login(values)
        sessionRef.current = result
        sceneActions.setStatus('success')
        setPhase('success')
      } catch (error) {
        setAuthError(error)
        sceneActions.error()
        if (error.code === AUTH_ERROR.RATE_LIMITED) {
          // Account-scoped locks apply to that email; network-scoped limits apply to any email.
          setLockedEmail(error.meta.scope === 'client' ? '*' : values.email.trim().toLowerCase())
          setRetryIn(error.meta.retryAfter ?? 30)
        } else if (error.code === AUTH_ERROR.VALIDATION && form.applyServerErrors(error.meta.fields)) {
          setAuthError(null)
        }
      }
    },
  })

  usePreviewFill((fill) => {
    form.setValues((prev) => ({ ...prev, ...fill }))
    setAuthError(null)
  })

  // Success → brief confirmation on the button → session hand-off
  useEffect(() => {
    if (phase !== 'success') return undefined
    const id = setTimeout(() => {
      setPhase('handoff')
      sceneActions.setStatus('transition')
    }, 650)
    return () => clearTimeout(id)
  }, [phase])

  useEffect(() => {
    sessionActions.acknowledgeSignOut()
  }, [])

  const finishHandoff = useCallback(() => {
    sessionActions.establish(sessionRef.current)
    navigate(destination, { replace: true })
  }, [navigate, destination])

  const { register, values } = form
  const errorCopy = authError ? describeAuthError(authError, 'login') : null
  // Account-scoped pauses apply to the throttled email only, not to the whole form
  const locked = retryIn > 0 && (lockedEmail === '*' || values.email.trim().toLowerCase() === lockedEmail)

  // Visiting sign-in with a live session goes straight to it (not mid hand-off).
  if (alreadySignedIn && phase === 'form') return <Navigate to={destination} replace />

  return (
    <AnimatePresence mode="wait" initial={false}>
      {phase === 'handoff' ? (
        <motion.div
          key="handoff"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.enter } }}
        >
          <SessionHandoff email={values.email.trim().toLowerCase()} onComplete={finishHandoff} />
        </motion.div>
      ) : (
        <motion.div key="form" exit={{ opacity: 0, y: -8, transition: { duration: duration.base, ease: ease.exit } }}>
          <Stagger>
            <ScreenHeader ref={headingRef} eyebrow="Secure sign-in" title="Welcome back">
              Sign in to your VulnTrack workspace.
            </ScreenHeader>

            <AnimatePresence initial={false}>
              {errorCopy && (
                <Alert
                  key={authError.code}
                  tone={authError.code === AUTH_ERROR.EMAIL_NOT_VERIFIED ? 'warning' : 'danger'}
                  title={errorCopy.title}
                  className="mb-6"
                  action={
                    authError.code === AUTH_ERROR.EMAIL_NOT_VERIFIED ? (
                      <TextLink to={`/verify-email?email=${encodeURIComponent(values.email.trim())}`}>
                        Resend verification email
                      </TextLink>
                    ) : null
                  }
                >
                  {errorCopy.body}
                  {locked && (
                    <>
                      {' '}
                      Try again in <span className="tabular text-fg">{formatSeconds(retryIn)}</span>.
                    </>
                  )}
                </Alert>
              )}
              {!errorCopy && passwordChanged && (
                <Alert key="reset" tone="success" title="Password updated" className="mb-6">
                  Sign in with your new password. Other active sessions were signed out.
                </Alert>
              )}
              {!errorCopy && !passwordChanged && signedOut && (
                <Alert key="signed-out" tone="info" title="You've been signed out" className="mb-6">
                  Your session on this device has ended.
                </Alert>
              )}
            </AnimatePresence>

            <form noValidate onSubmit={form.handleSubmit} aria-label="Sign in">
              <StaggerItem>
                <TextField
                  label="Work email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="name@company.com"
                  leadingIcon={<Mail size={17} strokeWidth={1.75} />}
                  {...register('email')}
                />
              </StaggerItem>

              <StaggerItem>
                <PasswordField label="Password" autoComplete="current-password" {...register('password')} />
              </StaggerItem>

              {/* Placed after the password field so keyboard order is email → password → options */}
              <StaggerItem className="mb-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <Checkbox
                  label="Keep me signed in"
                  checked={values.remember}
                  onChange={(event) => form.setValue('remember', event.target.checked)}
                />
                <TextLink to="/forgot-password" className="inline-flex min-h-11 items-center text-label">
                  Forgot password?
                </TextLink>
              </StaggerItem>

              <StaggerItem>
                <Button
                  type="submit"
                  fullWidth
                  loading={form.submitting}
                  success={phase === 'success'}
                  loadingLabel="Verifying credentials…"
                  successLabel="Signed in"
                  disabled={locked}
                  trailingIcon={locked ? null : <ArrowRight aria-hidden="true" size={17} />}
                >
                  {locked ? `Try again in ${formatSeconds(retryIn)}` : 'Sign in'}
                </Button>
              </StaggerItem>
              <p className="sr-only" role="status">
                {form.submitting ? 'Verifying credentials' : ''}
              </p>
            </form>

            <StaggerItem as="p" className="mt-8 text-center text-body text-fg-muted">
              New to VulnTrack? <TextLink to="/signup">Create a workspace</TextLink>
            </StaggerItem>
          </Stagger>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
