import { AnimatePresence, motion } from 'framer-motion'
import { Clock3, MailPlus, RotateCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Alert, Button, Dialog } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'
import { AUTH_ERROR } from '@/services/auth/authErrors'
import { paced, resendInvitation, revokeInvitation } from '@/services/organization/organizationApi'
import { describeOrganizationError, ORG_ERROR } from '@/services/organization/organizationErrors'
import { handleSessionLoss } from '../hooks/useApiResource'
import { RoleBadge } from './Identity'
import { focusHeading } from '../focus'
import { Panel, SkeletonRows } from './PagePrimitives'

function expiryText(invitation) {
  if (invitation.status === 'expired') return 'Expired'
  const days = Math.ceil((new Date(invitation.expiresAt).getTime() - Date.now()) / 86_400_000)
  return days <= 1 ? 'Expires within a day' : `Expires in ${days} days`
}

/** Pending (and expired, still resendable) invitations with resend / revoke. */
export function InvitationList({ resource, onChanged }) {
  const { status, data: invitations, error } = resource
  const [pending, setPending] = useState({}) // id → 'resend' | 'revoke'
  const [actionError, setActionError] = useState(null)
  const [resent, setResent] = useState(null)
  const [revoking, setRevoking] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const cancelRef = useRef(null)

  const run = async (invitation, kind, work) => {
    setPending((p) => ({ ...p, [invitation.id]: kind }))
    setActionError(null)
    setResent(null)
    try {
      await work()
    } catch (err) {
      handleSessionLoss(err)
      setActionError({ error: err, action: kind === 'resend' ? 'resend this invitation' : 'revoke this invitation' })
      if (err.code === AUTH_ERROR.FORBIDDEN || err.code === ORG_ERROR.NOT_FOUND) onChanged({ refreshAccess: true })
    } finally {
      setPending(({ [invitation.id]: _done, ...rest }) => rest)
    }
  }

  const resend = (invitation) =>
    run(invitation, 'resend', async () => {
      const { invitation: updated } = await paced(resendInvitation(invitation.id))
      resource.mutate((list) => list.map((i) => (i.id === updated.id ? updated : i)))
      setResent(updated.id)
      setAnnouncement(`Invitation to ${updated.email} sent again. The previous link no longer works.`)
    })

  const revoke = (invitation) =>
    run(invitation, 'revoke', async () => {
      try {
        await paced(revokeInvitation(invitation.id))
      } finally {
        setRevoking(null)
      }
      resource.mutate((list) => list.filter((i) => i.id !== invitation.id))
      setAnnouncement(`Invitation to ${invitation.email} revoked.`)
      focusHeading('invitations-heading')
      onChanged()
    })

  const errorCopy = actionError ? describeOrganizationError(actionError.error, actionError.action) : null
  const count = invitations?.length ?? 0

  return (
    <Panel
      headingId="invitations-heading"
      eyebrow="Pending"
      title="Invitations"
      description="Resending issues a new link and disables the previous one."
    >
      <AnimatePresence initial={false}>
        {errorCopy && (
          <motion.div key="error" className="px-5 pt-5 sm:px-6">
            <Alert tone="danger" title={errorCopy.title}>
              {errorCopy.body}
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {status === 'loading' && !invitations && <SkeletonRows rows={2} label="Loading invitations" />}

      {status === 'error' && !invitations && (
        <div className="p-5 sm:p-6">
          <Alert
            tone="danger"
            title={describeOrganizationError(error, 'load invitations').title}
            action={
              <Button variant="secondary" size="md" onClick={() => resource.reload()}>
                Try again
              </Button>
            }
          >
            {describeOrganizationError(error, 'load invitations').body}
          </Alert>
        </div>
      )}

      {invitations && count === 0 && (
        <div className="flex items-center gap-4 px-5 py-6 sm:px-6">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-surface-raised text-fg-subtle ring-1 ring-inset ring-line">
            <MailPlus size={17} strokeWidth={1.75} />
          </span>
          <p className="text-body text-fg-muted">No pending invitations.</p>
        </div>
      )}

      {invitations && count > 0 && (
        <ul aria-labelledby="invitations-heading" className="divide-y divide-line-subtle">
          <AnimatePresence initial={false}>
            {invitations.map((invitation) => {
              const busy = pending[invitation.id]
              const expired = invitation.status === 'expired'
              return (
                <motion.li
                  key={invitation.id}
                  layout="position"
                  exit={{ opacity: 0, x: -12, transition: { duration: duration.base, ease: ease.exit } }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6"
                >
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="truncate text-label text-fg">{invitation.email}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
                      <span className={cn('inline-flex items-center gap-1', expired && 'text-warning')}>
                        <Clock3 aria-hidden="true" size={12} />
                        {expiryText(invitation)}
                      </span>
                      {invitation.invitedBy && <span>· Invited by {invitation.invitedBy.fullName}</span>}
                      {resent === invitation.id && <span className="text-success">· Sent again</span>}
                    </p>
                  </div>
                  <RoleBadge role={invitation.role} label={invitation.roleLabel} />
                  {(invitation.actions.resend || invitation.actions.revoke) && (
                    <div className="flex w-full gap-2 sm:w-auto">
                      {invitation.actions.resend && (
                        <Button
                          variant="secondary"
                          size="md"
                          className="flex-1 sm:flex-none"
                          loading={busy === 'resend'}
                          loadingLabel="Sending…"
                          disabled={busy === 'revoke'}
                          leadingIcon={<RotateCw aria-hidden="true" size={15} />}
                          aria-label={`Resend invitation to ${invitation.email}`}
                          onClick={() => resend(invitation)}
                        >
                          Resend
                        </Button>
                      )}
                      {invitation.actions.revoke && (
                        <Button
                          variant="ghost"
                          size="md"
                          className="flex-1 hover:text-danger sm:flex-none"
                          disabled={Boolean(busy)}
                          aria-label={`Revoke invitation to ${invitation.email}`}
                          onClick={() => setRevoking(invitation)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {revoking && (
        <Dialog
          tone="danger"
          title="Revoke this invitation?"
          description={`The link sent to ${revoking.email} stops working. You can invite them again later.`}
          initialFocusRef={cancelRef}
          onClose={() => !pending[revoking.id] && setRevoking(null)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} variant="secondary" size="md" onClick={() => setRevoking(null)}>
              Keep invitation
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={pending[revoking.id] === 'revoke'}
              loadingLabel="Revoking…"
              onClick={() => revoke(revoking)}
            >
              Revoke invitation
            </Button>
          </div>
        </Dialog>
      )}
    </Panel>
  )
}
