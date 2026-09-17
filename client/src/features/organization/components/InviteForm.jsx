import { AnimatePresence } from 'framer-motion'
import { Mail, Send } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Button, SelectField, TextField } from '@/design-system/components'
import { AUTH_ERROR } from '@/services/auth/authErrors'
import { createInvitation, paced } from '@/services/organization/organizationApi'
import { describeOrganizationError, ORG_ERROR } from '@/services/organization/organizationErrors'
import { handleSessionLoss } from '../hooks/useApiResource'
import { Panel } from './PagePrimitives'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validateInviteEmail(value) {
  const email = value.trim()
  if (!email) return 'Enter an email address'
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email, like name@company.com'
  return undefined
}

/**
 * Invite by email with a role. The role list is the server's `assignableRoles`
 * for the caller, so nobody is offered a role they can't grant — and the API
 * rejects it anyway if the request is crafted by hand.
 */
export function InviteForm({ organizationName, assignableRoles, onInvited, onForbidden }) {
  const defaultRole = assignableRoles.find((r) => r.value === 'developer')?.value ?? assignableRoles.at(-1)?.value ?? ''
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(defaultRole)
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(null)
  const emailRef = useRef(null)

  const clientError = touched ? validateInviteEmail(email) : undefined
  const emailError = clientError ?? serverError?.email
  const roleError = serverError?.role

  const submit = async (event) => {
    event.preventDefault()
    if (submitting) return
    const invalid = validateInviteEmail(email)
    flushSync(() => setTouched(true))
    if (invalid) {
      emailRef.current?.focus()
      return
    }
    setSubmitting(true)
    setFormError(null)
    setServerError(null)
    setSent(null)
    try {
      const { invitation } = await paced(createInvitation({ email: email.trim(), role }), 600)
      setSent(invitation)
      setEmail('')
      setTouched(false)
      onInvited(invitation)
    } catch (error) {
      handleSessionLoss(error)
      if (error.code === AUTH_ERROR.VALIDATION && error.meta?.fields) {
        flushSync(() => setServerError(error.meta.fields))
        emailRef.current?.focus()
      } else if (error.code === ORG_ERROR.INVITATION_EXISTS || error.code === ORG_ERROR.ALREADY_MEMBER) {
        const message =
          error.code === ORG_ERROR.ALREADY_MEMBER
            ? 'This person is already a member'
            : 'An invitation is already pending for this email — resend it below'
        flushSync(() => setServerError({ email: message }))
        emailRef.current?.focus()
      } else {
        if (error.code === AUTH_ERROR.FORBIDDEN) onForbidden?.()
        setFormError(error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const formCopy = formError ? describeOrganizationError(formError, 'send this invitation') : null

  return (
    <Panel
      headingId="invite-heading"
      eyebrow="Access"
      title="Invite a teammate"
      description={`They'll receive an email link to join ${organizationName}. Links expire after 7 days and work once.`}
    >
      <form noValidate onSubmit={submit} aria-labelledby="invite-heading" className="px-5 pb-3 pt-5 sm:px-6">
        <AnimatePresence initial={false}>
          {formCopy && (
            <Alert key="error" tone="danger" title={formCopy.title} className="mb-5">
              {formCopy.body}
            </Alert>
          )}
          {sent && !formCopy && (
            <Alert key={`sent-${sent.id}`} tone="success" title="Invitation sent" className="mb-5">
              {sent.email} was invited as {sent.roleLabel}.
            </Alert>
          )}
        </AnimatePresence>

        <div className="grid gap-x-4 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-start">
          <TextField
            ref={emailRef}
            id="invite-email"
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@company.com"
            leadingIcon={<Mail size={17} strokeWidth={1.75} />}
            value={email}
            error={emailError}
            onChange={(event) => {
              setEmail(event.target.value)
              if (serverError?.email) setServerError(null)
            }}
            onBlur={() => email && setTouched(true)}
          />
          <SelectField
            id="invite-role"
            label="Role"
            value={role}
            error={roleError}
            options={assignableRoles}
            onChange={(event) => setRole(event.target.value)}
          />
          <div className="pb-2 md:pt-7">
            <Button
              type="submit"
              fullWidth
              loading={submitting}
              loadingLabel="Sending…"
              leadingIcon={<Send aria-hidden="true" size={16} />}
              className="md:w-auto"
            >
              Send invite
            </Button>
          </div>
        </div>
        <p className="sr-only" role="status">
          {submitting ? 'Sending invitation' : sent ? `Invitation sent to ${sent.email}` : ''}
        </p>
      </form>
    </Panel>
  )
}
