import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Alert, Button, Spinner, TextField, TextLink } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { AUTH_ERROR, describeAuthError, resendVerification, verifyEmail } from '@/services/auth/authService'
import { sceneActions } from '../artwork/sceneStore'
import { ScreenHeader } from '../components/ScreenHeader'
import { Stagger, StaggerItem } from '../components/Stagger'
import { StatusEmblem } from '../components/StatusEmblem'
import { formatSeconds, useAuthScreen, useCountdown } from '../hooks/useAuthScreen'
import { validateEmail } from '../validation/validators'

const RESEND_COOLDOWN = 60

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.enter } },
  exit: { opacity: 0, y: -8, transition: { duration: duration.base, ease: ease.exit } },
}

/**
 * Resend control shared by the pending and expired states.
 * Asks for the email only when we don't already know it.
 */
function ResendVerification({ knownEmail, initialCooldown = 0 }) {
  const [email, setEmail] = useState(knownEmail ?? '')
  const [touched, setTouched] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [cooldown, setCooldown] = useCountdown()

  useEffect(() => {
    if (initialCooldown) setCooldown(initialCooldown)
  }, [initialCooldown, setCooldown])

  const emailError = knownEmail ? undefined : validateEmail(email)

  const send = async (event) => {
    event.preventDefault()
    setTouched(true)
    if (emailError) {
      sceneActions.error()
      document.getElementById('resend-email')?.focus()
      return
    }
    setSending(true)
    setError(null)
    setSent(false)
    sceneActions.setStatus('loading')
    try {
      const result = await resendVerification({ email })
      setSent(true)
      setCooldown(result.cooldown ?? RESEND_COOLDOWN)
      sceneActions.setStatus('idle')
      sceneActions.pulse()
    } catch (err) {
      setError(err)
      sceneActions.error()
    } finally {
      setSending(false)
    }
  }

  const errorCopy = error ? describeAuthError(error) : null

  return (
    <form noValidate onSubmit={send} aria-label="Resend verification email">
      <AnimatePresence initial={false}>
        {errorCopy && (
          <Alert key="error" tone="danger" title={errorCopy.title} className="mb-6">
            {errorCopy.body}
          </Alert>
        )}
        {sent && !errorCopy && (
          <Alert key="sent" tone="success" title="Verification email sent" className="mb-6">
            Only the most recent link will work.
          </Alert>
        )}
      </AnimatePresence>

      {!knownEmail && (
        <TextField
          id="resend-email"
          label="Work email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@company.com"
          leadingIcon={<Mail size={17} strokeWidth={1.75} />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => email && setTouched(true)}
          error={touched ? emailError : undefined}
        />
      )}

      <Button
        type="submit"
        variant={knownEmail ? 'secondary' : 'primary'}
        fullWidth
        loading={sending}
        loadingLabel="Sending…"
        disabled={cooldown > 0}
        className={knownEmail ? '' : 'mt-3'}
      >
        {cooldown > 0 ? (
          <>
            Resend available in <span className="tabular">{formatSeconds(cooldown)}</span>
          </>
        ) : (
          'Resend verification email'
        )}
      </Button>
    </form>
  )
}

export function VerifyEmailPage() {
  const headingRef = useAuthScreen({ title: 'Verify email', mode: 'verify' })
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const email = searchParams.get('email')
  const justSignedUp = searchParams.get('new') === '1'
  // pending | verifying | success | expired | invalid | error
  const [view, setView] = useState(token ? 'verifying' : 'pending')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!token) {
      setView('pending')
      return undefined
    }
    let cancelled = false
    setView('verifying')
    sceneActions.setStatus('loading')
    verifyEmail({ token })
      .then(() => {
        if (cancelled) return
        setView('success')
        sceneActions.setStatus('success')
      })
      .catch((error) => {
        if (cancelled) return
        setView(
          error.code === AUTH_ERROR.TOKEN_EXPIRED ? 'expired' : error.code === AUTH_ERROR.TOKEN_INVALID ? 'invalid' : 'error',
        )
        sceneActions.error()
      })
    return () => {
      cancelled = true
    }
  }, [token, attempt])

  return (
    <AnimatePresence mode="wait" initial={false}>
      {view === 'pending' && (
        <motion.div key="pending" {...fade}>
          <Stagger>
            <StaggerItem className="mb-8">
              <StatusEmblem tone="pending" />
            </StaggerItem>
            <ScreenHeader
              ref={headingRef}
              eyebrow={justSignedUp ? 'Workspace created · Step 2 of 2' : 'Email verification'}
              title="Verify your email"
            >
              {email ? (
                <>
                  We sent a verification link to <span className="break-all text-fg">{email}</span>. Open it on this
                  device to activate your account.
                </>
              ) : (
                'Open the verification link we emailed you to activate your account.'
              )}
            </ScreenHeader>

            <StaggerItem>
              <ResendVerification knownEmail={email} initialCooldown={justSignedUp ? RESEND_COOLDOWN : 0} />
            </StaggerItem>

            <StaggerItem as="p" className="mt-6 text-caption text-fg-subtle">
              Can't find it? Check spam or quarantine folders — security filters sometimes hold verification emails.
            </StaggerItem>

            <StaggerItem as="p" className="mt-8 text-center text-body text-fg-muted">
              Wrong address? <TextLink to="/signup">Start again</TextLink>
              <span aria-hidden="true" className="mx-2 text-fg-disabled">
                ·
              </span>
              <TextLink to="/login">Sign in</TextLink>
            </StaggerItem>
          </Stagger>
        </motion.div>
      )}

      {view === 'verifying' && (
        <motion.div key="verifying" {...fade}>
          <Stagger>
          <StaggerItem className="mb-8">
            <StatusEmblem tone="progress" />
          </StaggerItem>
          <ScreenHeader ref={headingRef} eyebrow="Email verification" title="Verifying your email">
            <span className="inline-flex items-center gap-2" role="status">
              <Spinner size={14} className="text-ion" />
              Confirming your verification link…
            </span>
          </ScreenHeader>
          </Stagger>
        </motion.div>
      )}

      {view === 'success' && (
        <motion.div key="success" {...fade}>
          <Stagger>
            <StaggerItem className="mb-8">
              <StatusEmblem tone="success" />
            </StaggerItem>
            <ScreenHeader focusOnMount eyebrow="Verified" tone="success" title="Your email is verified">
              Your account is active. Sign in to open your workspace.
            </ScreenHeader>
            <StaggerItem>
              <Button
                fullWidth
                trailingIcon={<ArrowRight aria-hidden="true" size={17} />}
                onClick={() => navigate('/login', { replace: true })}
              >
                Continue to sign in
              </Button>
            </StaggerItem>
          </Stagger>
        </motion.div>
      )}

      {(view === 'expired' || view === 'invalid') && (
        <motion.div key={view} {...fade}>
          <Stagger>
            <StaggerItem className="mb-8">
              <StatusEmblem tone={view === 'expired' ? 'expired' : 'failure'} />
            </StaggerItem>
            <ScreenHeader
              focusOnMount
              eyebrow={view === 'expired' ? 'Link expired' : 'Link not valid'}
              tone={view === 'expired' ? 'warning' : 'danger'}
              title={view === 'expired' ? 'This verification link has expired' : "This verification link isn't valid"}
            >
              {view === 'expired'
                ? 'Verification links expire for your security. Enter your email and we’ll send a fresh one.'
                : 'It may have been used already or copied incorrectly. Request a new verification email below.'}
            </ScreenHeader>
            <StaggerItem>
              <ResendVerification knownEmail={email} />
            </StaggerItem>
            <StaggerItem as="p" className="mt-8 text-center text-body text-fg-muted">
              Already verified? <TextLink to="/login">Sign in</TextLink>
            </StaggerItem>
          </Stagger>
        </motion.div>
      )}

      {view === 'error' && (
        <motion.div key="error" {...fade}>
          <Stagger>
            <StaggerItem className="mb-8">
              <StatusEmblem tone="failure" />
            </StaggerItem>
            <ScreenHeader focusOnMount eyebrow="Verification" tone="danger" title="We couldn't verify your email">
              Something went wrong on our side. Your link may still be valid — try again.
            </ScreenHeader>
            <StaggerItem className="grid gap-3">
              <Button fullWidth onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </Button>
              <Button variant="ghost" fullWidth onClick={() => navigate('/login')}>
                Back to sign in
              </Button>
            </StaggerItem>
          </Stagger>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
