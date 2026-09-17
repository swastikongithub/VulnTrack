import { AnimatePresence, motion } from 'framer-motion'
import { Check, UserMinus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Alert, Button, Dialog, IconButton, SelectField, Spinner } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'
import { AUTH_ERROR } from '@/services/auth/authErrors'
import { paced, removeMember, updateMemberRole } from '@/services/organization/organizationApi'
import { describeOrganizationError, ORG_ERROR } from '@/services/organization/organizationErrors'
import { handleSessionLoss } from '../hooks/useApiResource'
import { Avatar, RoleBadge } from './Identity'
import { focusHeading } from '../focus'
import { Panel, SkeletonRows } from './PagePrimitives'

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/**
 * Member roster. Per-row controls come from the server's `actions` flags and
 * `assignableRoles`; a stale view (someone else changed roles) is corrected
 * by refreshing after any rejection.
 */
export function MemberList({ resource, organizationName, assignableRoles, onChanged }) {
  const { status, data: members, error } = resource
  const [pending, setPending] = useState({}) // userId → 'role' | 'remove'
  const [confirmed, setConfirmed] = useState(null) // userId whose role change just succeeded
  const [actionError, setActionError] = useState(null)
  const [removing, setRemoving] = useState(null) // member pending confirmation
  const [promoting, setPromoting] = useState(null) // { member, role } pending owner confirmation
  const [announcement, setAnnouncement] = useState('')
  const cancelRemoveRef = useRef(null)
  const cancelPromoteRef = useRef(null)

  const fail = (err, action) => {
    handleSessionLoss(err)
    setActionError({ error: err, action })
    if ([AUTH_ERROR.FORBIDDEN, ORG_ERROR.NOT_FOUND, ORG_ERROR.LAST_OWNER].includes(err.code)) onChanged({ refreshAccess: true })
  }

  const changeRole = async (member, role) => {
    setPending((p) => ({ ...p, [member.userId]: 'role' }))
    setActionError(null)
    setConfirmed(null)
    try {
      const { member: updated } = await paced(updateMemberRole(member.userId, role))
      resource.mutate((list) => list.map((m) => (m.userId === updated.userId ? updated : m)))
      setConfirmed(member.userId)
      setAnnouncement(`${member.fullName} is now ${updated.roleLabel}.`)
      onChanged()
    } catch (err) {
      fail(err, 'change this role')
    } finally {
      setPending(({ [member.userId]: _done, ...rest }) => rest)
    }
  }

  const remove = async (member) => {
    setPending((p) => ({ ...p, [member.userId]: 'remove' }))
    setActionError(null)
    try {
      await paced(removeMember(member.userId))
      setRemoving(null)
      resource.mutate((list) => list.filter((m) => m.userId !== member.userId))
      setAnnouncement(`${member.fullName} was removed from ${organizationName}.`)
      focusHeading('members-heading')
      onChanged()
    } catch (err) {
      setRemoving(null)
      fail(err, 'remove this member')
    } finally {
      setPending(({ [member.userId]: _done, ...rest }) => rest)
    }
  }

  const errorCopy = actionError ? describeOrganizationError(actionError.error, actionError.action) : null

  return (
    <Panel
      headingId="members-heading"
      eyebrow="Roster"
      title="Members"
      description="Roles are per organization. Owners manage everyone; admins manage roles below admin."
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

      {status === 'loading' && !members && <SkeletonRows rows={4} label="Loading members" />}

      {status === 'error' && !members && (
        <div className="p-5 sm:p-6">
          <Alert
            tone="danger"
            title={describeOrganizationError(error, 'load members').title}
            action={
              <Button variant="secondary" size="md" onClick={() => resource.reload()}>
                Try again
              </Button>
            }
          >
            {describeOrganizationError(error, 'load members').body}
          </Alert>
        </div>
      )}

      {members && (
        <>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1.7fr)_minmax(11rem,1fr)_7.5rem_2.75rem] gap-4 border-b border-line-subtle px-6 py-2.5 md:grid"
          >
            {['Member', 'Role', 'Joined', ''].map((label) => (
              <span key={label} className="eyebrow text-fg-subtle">
                {label}
              </span>
            ))}
          </div>
          <ul aria-labelledby="members-heading" className="divide-y divide-line-subtle">
            <AnimatePresence initial={false}>
              {members.map((member) => {
                const busy = pending[member.userId]
                return (
                  <motion.li
                    key={member.userId}
                    layout="position"
                    exit={{ opacity: 0, x: -12, transition: { duration: duration.base, ease: ease.exit } }}
                    className={cn(
                      'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6',
                      'md:grid-cols-[minmax(0,1.7fr)_minmax(11rem,1fr)_7.5rem_2.75rem]',
                      busy === 'remove' && 'opacity-60',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={member.fullName} highlight={member.isCurrentUser} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-label text-fg">
                          <span className="truncate">{member.fullName}</span>
                          {member.isCurrentUser && (
                            <span className="eyebrow rounded-full bg-ion-dim px-2 py-0.5 text-ion">You</span>
                          )}
                        </p>
                        <p className="truncate text-caption text-fg-subtle">{member.email}</p>
                      </div>
                    </div>

                    <div className="col-span-2 flex items-center gap-2 md:col-span-1">
                      {member.actions.updateRole ? (
                        <>
                          <SelectField
                            compact
                            className="min-w-0 flex-1"
                            aria-label={`Role for ${member.fullName}`}
                            value={member.role}
                            disabled={Boolean(busy)}
                            options={roleOptions(assignableRoles, member)}
                            onChange={(event) => {
                              const role = event.target.value
                              if (role === 'owner') setPromoting({ member, role })
                              else changeRole(member, role)
                            }}
                          />
                          <span className="grid size-5 shrink-0 place-items-center text-success" aria-hidden="true">
                            {busy === 'role' ? (
                              <Spinner size={15} className="text-ion" />
                            ) : confirmed === member.userId ? (
                              <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                                <Check size={16} strokeWidth={2.4} />
                              </motion.span>
                            ) : null}
                          </span>
                        </>
                      ) : (
                        <RoleBadge role={member.role} label={member.roleLabel} />
                      )}
                    </div>

                    <p className="col-start-1 row-start-3 text-caption text-fg-subtle md:col-start-auto md:row-start-auto">
                      <span className="md:sr-only">Joined </span>
                      <time dateTime={member.joinedAt}>{dateFormat.format(new Date(member.joinedAt))}</time>
                    </p>

                    <div className="col-start-2 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
                      {member.actions.remove && (
                        <IconButton
                          label={`Remove ${member.fullName}`}
                          disabled={Boolean(busy)}
                          onClick={() => setRemoving(member)}
                          className="hover:text-danger disabled:opacity-40"
                        >
                          <UserMinus size={17} strokeWidth={1.75} />
                        </IconButton>
                      )}
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {removing && (
        <Dialog
          tone="danger"
          title={`Remove ${removing.fullName}?`}
          description={
            <>
              They lose access to {organizationName} immediately. Their account and other organizations are not affected,
              and pending invitations they sent are revoked.
            </>
          }
          initialFocusRef={cancelRemoveRef}
          onClose={() => !pending[removing.userId] && setRemoving(null)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button ref={cancelRemoveRef} variant="secondary" size="md" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={pending[removing.userId] === 'remove'}
              loadingLabel="Removing…"
              onClick={() => remove(removing)}
            >
              Remove member
            </Button>
          </div>
        </Dialog>
      )}

      {promoting && (
        <Dialog
          title={`Make ${promoting.member.fullName} an owner?`}
          description="Owners have full control of the organization, including changing or removing other owners — you included."
          initialFocusRef={cancelPromoteRef}
          onClose={() => setPromoting(null)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button ref={cancelPromoteRef} variant="secondary" size="md" onClick={() => setPromoting(null)}>
              Cancel
            </Button>
            <Button
              size="md"
              onClick={() => {
                const { member, role } = promoting
                setPromoting(null)
                changeRole(member, role)
              }}
            >
              Make owner
            </Button>
          </div>
        </Dialog>
      )}
    </Panel>
  )
}

/** The member's current role is always listed (even if the caller couldn't grant it), so the select shows it. */
function roleOptions(assignableRoles, member) {
  if (assignableRoles.some((r) => r.value === member.role)) return assignableRoles
  return [{ value: member.role, label: member.roleLabel }, ...assignableRoles]
}
