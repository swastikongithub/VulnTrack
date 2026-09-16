import { AnimatePresence } from 'framer-motion'
import { ArrowRight, Building2, Mail, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Alert,
  Button,
  ErrorSummary,
  PasswordField,
  PasswordStrength,
  TextField,
  TextLink,
} from '@/design-system/components'
import { describeAuthError, signup } from '@/services/auth/authService'
import { sceneActions } from '../artwork/sceneStore'
import { ScreenHeader } from '../components/ScreenHeader'
import { Stagger, StaggerItem } from '../components/Stagger'
import { useAuthForm } from '../hooks/useAuthForm'
import { useAuthScreen, usePreviewFill } from '../hooks/useAuthScreen'
import { sessionActions } from '../sessionStore'
import {
  estimateStrength,
  passwordChecks,
  validateConfirmPassword,
  validateEmail,
  validateFullName,
  validateNewPassword,
  validateWorkspace,
} from '../validation/validators'

const INITIAL = { fullName: '', email: '', workspace: '', password: '', confirmPassword: '' }

const LABELS = {
  fullName: 'Full name',
  email: 'Work email',
  workspace: 'Workspace name',
  password: 'Password',
  confirmPassword: 'Confirm password',
}

function validate(v) {
  const context = { email: v.email, name: v.fullName }
  return {
    fullName: validateFullName(v.fullName),
    email: validateEmail(v.email),
    workspace: validateWorkspace(v.workspace),
    password: validateNewPassword(v.password, context),
    confirmPassword: validateConfirmPassword(v.confirmPassword, v.password),
  }
}

export function SignupPage() {
  const headingRef = useAuthScreen({ title: 'Create account', mode: 'signup' })
  const navigate = useNavigate()
  const [authError, setAuthError] = useState(null)
  const [created, setCreated] = useState(false)

  const form = useAuthForm({
    initialValues: INITIAL,
    validate,
    useSummary: true,
    onSubmit: async (values) => {
      setAuthError(null)
      try {
        const result = await signup(values)
        sessionActions.setPendingSignup(result)
        sceneActions.setStatus('success')
        setCreated(true)
        setTimeout(() => navigate(`/verify-email?email=${encodeURIComponent(result.email)}&new=1`), 900)
      } catch (error) {
        setAuthError(error)
        sceneActions.error()
      }
    },
  })

  usePreviewFill((fill) => form.setValues((prev) => ({ ...prev, ...fill })))

  const { register, values, allErrors, submitted, submitting, handleSubmit, summaryRef } = form

  // The perimeter is provisioned as the workspace details become valid
  const validCount = Object.values(allErrors).filter((e) => !e).length
  useEffect(() => {
    sceneActions.setProgress(validCount / 5)
  }, [validCount])

  const context = { email: values.email, name: values.fullName }
  const checks = passwordChecks(values.password, context)
  const strength = estimateStrength(values.password, context)
  const errorCopy = authError ? describeAuthError(authError) : null

  return (
    <Stagger>
      <ScreenHeader ref={headingRef} eyebrow="New workspace" title="Create your workspace">
        You'll be the workspace owner and can invite your team after verifying your email.
      </ScreenHeader>

      <AnimatePresence initial={false}>
        {errorCopy && (
          <Alert key="error" tone="danger" title={errorCopy.title} className="mb-6">
            {errorCopy.body}
          </Alert>
        )}
      </AnimatePresence>

      <form noValidate onSubmit={handleSubmit} aria-label="Create account">
        <AnimatePresence>
          {submitted && (
            <div className="mb-6 empty:hidden">
              <ErrorSummary ref={summaryRef} errors={allErrors} fieldLabels={LABELS} />
            </div>
          )}
        </AnimatePresence>

        <fieldset className="contents">
          <legend className="sr-only">Your details</legend>
          <div>
            <StaggerItem>
              <TextField
                label={LABELS.fullName}
                autoComplete="name"
                leadingIcon={<UserRound size={17} strokeWidth={1.75} />}
                placeholder="Ada Morgan"
                {...register('fullName')}
              />
            </StaggerItem>
            <StaggerItem className="mt-1">
              <TextField
                label={LABELS.email}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@company.com"
                leadingIcon={<Mail size={17} strokeWidth={1.75} />}
                {...register('email')}
              />
            </StaggerItem>
          </div>
        </fieldset>

        <StaggerItem className="mt-1">
          <TextField
            label={LABELS.workspace}
            autoComplete="organization"
            placeholder="Acme Security"
            hint="Usually your company or team. You can rename it later."
            leadingIcon={<Building2 size={17} strokeWidth={1.75} />}
            {...register('workspace')}
          />
        </StaggerItem>

        <fieldset className="contents">
          <legend className="sr-only">Password</legend>
          <StaggerItem className="mt-1">
            <PasswordField
              label={LABELS.password}
              autoComplete="new-password"
              aria-describedby="password-message password-strength"
              {...register('password')}
            />
            <PasswordStrength
              id="password-strength"
              score={strength}
              checks={checks}
              active={values.password.length > 0}
            />
          </StaggerItem>

          <StaggerItem>
            <PasswordField label={LABELS.confirmPassword} autoComplete="new-password" {...register('confirmPassword')} />
          </StaggerItem>
        </fieldset>

        <StaggerItem className="mt-4">
          <Button
            type="submit"
            fullWidth
            loading={submitting}
            success={created}
            loadingLabel="Creating workspace…"
            successLabel="Workspace created"
            trailingIcon={<ArrowRight aria-hidden="true" size={17} />}
          >
            Create workspace
          </Button>
        </StaggerItem>
        <p className="sr-only" role="status">
          {submitting ? 'Creating your workspace' : created ? 'Workspace created. Check your email to verify.' : ''}
        </p>
      </form>

      <StaggerItem as="p" className="mt-8 text-center text-body text-fg-muted">
        Already have an account? <TextLink to="/login">Sign in</TextLink>
      </StaggerItem>
    </Stagger>
  )
}
