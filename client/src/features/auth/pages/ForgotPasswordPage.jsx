import { AnimatePresence, motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, TextField, TextLink } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { describeAuthError, requestPasswordReset } from '@/services/auth/authService'
import { sceneActions } from '../artwork/sceneStore'
import { BackLink } from '../components/BackLink'
import { ScreenHeader } from '../components/ScreenHeader'
import { Stagger, StaggerItem } from '../components/Stagger'
import { StatusEmblem } from '../components/StatusEmblem'
import { useAuthForm } from '../hooks/useAuthForm'
import { formatSeconds, useAuthScreen, useCountdown, usePreviewFill } from '../hooks/useAuthScreen'
import { validateEmail } from '../validation/validators'

const INITIAL = { email: '' }
const RESEND_COOLDOWN = 60

export function ForgotPasswordPage() {
  const headingRef = useAuthScreen({ title: 'Reset password', mode: 'recovery' })
  const [authError, setAuthError] = useState(null)
  const [sentTo, setSentTo] = useState(null)
  const [cooldown, setCooldown] = useCountdown()
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const form = useAuthForm({
    initialValues: INITIAL,
    validate: (v) => ({ email: validateEmail(v.email) }),
    onSubmit: async ({ email }) => {
      setAuthError(null)
      try {
        await requestPasswordReset({ email })
        sceneActions.setStatus('idle')
        sceneActions.pulse()
        setSentTo(email.trim())
        setCooldown(RESEND_COOLDOWN)
      } catch (error) {
        setAuthError(error)
        sceneActions.error()
      }
    },
  })

  usePreviewFill((fill) => form.setValues((prev) => ({ ...prev, ...fill })))

  const resend = async () => {
    setResending(true)
    setResent(false)
    sceneActions.setStatus('loading')
    try {
      await requestPasswordReset({ email: sentTo })
      sceneActions.setStatus('idle')
      sceneActions.pulse()
      setResent(true)
      setCooldown(RESEND_COOLDOWN)
    } catch (error) {
      setAuthError(error)
      sceneActions.error()
    } finally {
      setResending(false)
    }
  }

  const errorCopy = authError ? describeAuthError(authError) : null

  return (
    <AnimatePresence mode="wait" initial={false}>
      {sentTo ? (
        <motion.div
          key="sent"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.enter } }}
        >
          <Stagger>
            <StaggerItem className="mb-8">
              <StatusEmblem tone="recovery" />
            </StaggerItem>
            <ScreenHeader focusOnMount eyebrow="Link sent" tone="iris" title="Check your inbox">
              If an account exists for <span className="break-all text-fg">{sentTo}</span>, we've sent a link to reset
              your password. For your security, the link expires after a short time.
            </ScreenHeader>

            <AnimatePresence initial={false}>
              {errorCopy && (
                <Alert key="error" tone="danger" title={errorCopy.title} className="mb-6">
                  {errorCopy.body}
                </Alert>
              )}
              {resent && !errorCopy && (
                <Alert key="resent" tone="success" title="Link sent again" className="mb-6">
                  Only the most recent link will work.
                </Alert>
              )}
            </AnimatePresence>

            <StaggerItem className="grid gap-3">
              <Button
                variant="secondary"
                fullWidth
                loading={resending}
                loadingLabel="Sending…"
                disabled={cooldown > 0}
                onClick={resend}
              >
                {cooldown > 0 ? (
                  <>
                    Resend available in <span className="tabular">{formatSeconds(cooldown)}</span>
                  </>
                ) : (
                  'Resend link'
                )}
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setSentTo(null)
                  setResent(false)
                  setAuthError(null)
                }}
              >
                Use a different email
              </Button>
            </StaggerItem>

            <StaggerItem as="p" className="mt-8 text-center text-body text-fg-muted">
              Remembered it? <TextLink to="/login">Back to sign in</TextLink>
            </StaggerItem>
          </Stagger>
        </motion.div>
      ) : (
        <motion.div key="form" exit={{ opacity: 0, y: -8, transition: { duration: duration.base, ease: ease.exit } }}>
          <Stagger>
            <BackLink />
            <ScreenHeader ref={headingRef} eyebrow="Account recovery" tone="iris" title="Reset your password">
              Enter the email you use for VulnTrack and we'll send you a secure reset link.
            </ScreenHeader>

            <AnimatePresence initial={false}>
              {errorCopy && (
                <Alert key="error" tone="danger" title={errorCopy.title} className="mb-6">
                  {errorCopy.body}
                </Alert>
              )}
            </AnimatePresence>

            <form noValidate onSubmit={form.handleSubmit} aria-label="Request password reset">
              <StaggerItem>
                <TextField
                  label="Work email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="name@company.com"
                  leadingIcon={<Mail size={17} strokeWidth={1.75} />}
                  {...form.register('email')}
                />
              </StaggerItem>
              <StaggerItem className="mt-3">
                <Button type="submit" fullWidth loading={form.submitting} loadingLabel="Sending reset link…">
                  Send reset link
                </Button>
              </StaggerItem>
              <p className="sr-only" role="status">
                {form.submitting ? 'Sending reset link' : ''}
              </p>
            </form>
          </Stagger>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
