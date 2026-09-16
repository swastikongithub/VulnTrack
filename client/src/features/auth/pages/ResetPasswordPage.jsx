import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Alert, Button, ErrorSummary, PasswordField, PasswordStrength, Spinner } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { AUTH_ERROR, checkResetToken, describeAuthError, resetPassword } from '@/services/auth/authService'
import { sceneActions } from '../artwork/sceneStore'
import { BackLink } from '../components/BackLink'
import { ScreenHeader } from '../components/ScreenHeader'
import { Stagger, StaggerItem } from '../components/Stagger'
import { StatusEmblem } from '../components/StatusEmblem'
import { useAuthForm } from '../hooks/useAuthForm'
import { useAuthScreen } from '../hooks/useAuthScreen'
import {
  estimateStrength,
  passwordChecks,
  validateConfirmPassword,
  validateNewPassword,
} from '../validation/validators'

const INITIAL = { password: '', confirmPassword: '' }
const LABELS = { password: 'New password', confirmPassword: 'Confirm new password' }

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.enter } },
  exit: { opacity: 0, y: -8, transition: { duration: duration.base, ease: ease.exit } },
}

export function ResetPasswordPage() {
  const headingRef = useAuthScreen({ title: 'Choose a new password', mode: 'recovery' })
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  // checking | form | success | expired | invalid
  const [view, setView] = useState('checking')
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setView('checking')
    sceneActions.setStatus('loading')
    checkResetToken({ token })
      .then(() => {
        if (cancelled) return
        setView('form')
        sceneActions.setStatus('idle')
      })
      .catch((error) => {
        if (cancelled) return
        setView(error.code === AUTH_ERROR.TOKEN_EXPIRED ? 'expired' : 'invalid')
        sceneActions.error()
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const form = useAuthForm({
    initialValues: INITIAL,
    useSummary: true,
    validate: (v) => ({
      password: validateNewPassword(v.password),
      confirmPassword: validateConfirmPassword(v.confirmPassword, v.password),
    }),
    onSubmit: async ({ password }) => {
      setAuthError(null)
      try {
        await resetPassword({ token, password })
        sceneActions.setStatus('success')
        setView('success')
      } catch (error) {
        if (error.code === AUTH_ERROR.TOKEN_EXPIRED || error.code === AUTH_ERROR.TOKEN_INVALID) {
          setView(error.code === AUTH_ERROR.TOKEN_EXPIRED ? 'expired' : 'invalid')
        } else {
          setAuthError(error)
        }
        sceneActions.error()
      }
    },
  })

  const { register, values, allErrors, submitted, submitting, handleSubmit, summaryRef } = form
  const checks = passwordChecks(values.password)
  const strength = estimateStrength(values.password)
  const errorCopy = authError ? describeAuthError(authError) : null

  return (
    <AnimatePresence mode="wait" initial={false}>
      {view === 'checking' && (
        <motion.div key="checking" {...fade} className="py-6">
          <Stagger>
          <ScreenHeader ref={headingRef} eyebrow="Account recovery" tone="iris" title="Checking your link">
            <span className="inline-flex items-center gap-2" role="status">
              <Spinner size={14} className="text-iris" />
              Validating the reset link…
            </span>
          </ScreenHeader>
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
              title={view === 'expired' ? 'This reset link has expired' : "This reset link isn't valid"}
            >
              {view === 'expired'
                ? 'Reset links are short-lived to keep your account safe. Request a new one to continue.'
                : 'It may have already been used or copied incorrectly. Request a new link to continue.'}
            </ScreenHeader>
            <StaggerItem className="grid gap-3">
              <Button fullWidth onClick={() => navigate('/forgot-password')}>
                Request a new link
              </Button>
              <Button variant="ghost" fullWidth onClick={() => navigate('/login')}>
                Back to sign in
              </Button>
            </StaggerItem>
          </Stagger>
        </motion.div>
      )}

      {view === 'success' && (
        <motion.div key="success" {...fade}>
          <Stagger>
            <StaggerItem className="mb-8">
              <StatusEmblem tone="success" />
            </StaggerItem>
            <ScreenHeader focusOnMount eyebrow="Password updated" tone="success" title="You're all set">
              Your password has been changed and all other active sessions were signed out.
            </ScreenHeader>
            <StaggerItem>
              <Button
                fullWidth
                trailingIcon={<ArrowRight aria-hidden="true" size={17} />}
                onClick={() => navigate('/login?reset=success', { replace: true })}
              >
                Continue to sign in
              </Button>
            </StaggerItem>
          </Stagger>
        </motion.div>
      )}

      {view === 'form' && (
        <motion.div key="form" {...fade}>
          <Stagger>
            <BackLink />
            <ScreenHeader ref={headingRef} eyebrow="Account recovery" tone="iris" title="Choose a new password">
              Use at least 12 characters. A long passphrase is easier to remember and harder to guess.
            </ScreenHeader>

            <AnimatePresence initial={false}>
              {errorCopy && (
                <Alert key="error" tone="danger" title={errorCopy.title} className="mb-6">
                  {errorCopy.body}
                </Alert>
              )}
            </AnimatePresence>

            <form noValidate onSubmit={handleSubmit} aria-label="Choose a new password">
              {submitted && (
                <div className="mb-6 empty:hidden">
                  <ErrorSummary ref={summaryRef} errors={allErrors} fieldLabels={LABELS} />
                </div>
              )}
              <StaggerItem>
                <PasswordField
                  label={LABELS.password}
                  autoComplete="new-password"
                  aria-describedby="password-message password-strength"
                  {...register('password')}
                />
                <PasswordStrength id="password-strength" score={strength} checks={checks} active={values.password.length > 0} />
              </StaggerItem>
              <StaggerItem>
                <PasswordField label={LABELS.confirmPassword} autoComplete="new-password" {...register('confirmPassword')} />
              </StaggerItem>
              <StaggerItem className="mt-4">
                <Button type="submit" fullWidth loading={submitting} loadingLabel="Updating password…">
                  Update password
                </Button>
              </StaggerItem>
              <p className="sr-only" role="status">
                {submitting ? 'Updating password' : ''}
              </p>
            </form>
          </Stagger>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
