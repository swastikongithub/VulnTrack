import { LockKeyhole } from 'lucide-react'
import { useCallback } from 'react'
import { useSessionStore } from '@/features/auth/sessionStore'
import { listInvitations, listMembers } from '@/services/organization/organizationApi'
import { InvitationList } from '../components/InvitationList'
import { InviteForm } from '../components/InviteForm'
import { MemberList } from '../components/MemberList'
import { PageHeader, Readouts, SkeletonRows, Stagger, StaggerItem } from '../components/PagePrimitives'
import { RoleBadge } from '../components/Identity'
import { useApiResource } from '../hooks/useApiResource'
import { can, useOrganization } from '../organizationContext'

const unwrap = (key) => (promise) => promise.then((body) => body[key])

/**
 * Members & invitations for the current organization. Which panels appear
 * follows the caller's permissions from the API; every action is authorized
 * again server-side.
 */
export function MembersPage() {
  const { details, status, reload: reloadDetails } = useOrganization()
  const organizationId = useSessionStore((s) => s.session?.organization?.id)

  const canReadMembers = can(details, 'members:read')
  const canInvite = can(details, 'members:invite')

  const members = useApiResource(
    () => (canReadMembers ? unwrap('members')(listMembers()) : Promise.resolve(null)),
    `${organizationId}:members:${canReadMembers}`,
  )
  const invitations = useApiResource(
    () => (canInvite ? unwrap('invitations')(listInvitations()) : Promise.resolve(null)),
    `${organizationId}:invitations:${canInvite}`,
  )

  const reloadMembers = members.reload
  const reloadInvitations = invitations.reload
  const onChanged = useCallback(
    ({ refreshAccess = false } = {}) => {
      // Refresh counts, and on a rejection also capabilities and lists (the view was stale).
      reloadDetails({ quiet: true })
      if (refreshAccess) {
        reloadMembers({ quiet: true })
        reloadInvitations({ quiet: true })
      }
    },
    [reloadDetails, reloadMembers, reloadInvitations],
  )

  if (!details) {
    return (
      <div className="rounded-xl bg-surface/95 ring-1 ring-line">
        <SkeletonRows rows={4} label={status === 'loading' ? 'Loading organization' : 'Organization unavailable'} />
      </div>
    )
  }

  const { organization, membership, assignableRoles } = details
  const pendingCount = invitations.data?.length

  return (
    <Stagger>
      <PageHeader eyebrow={`${organization.name} · Members`} title="Members">
        People with access to {organization.name}. Each person has one role here, which decides what they can see and change.
      </PageHeader>

      <StaggerItem className="mb-8">
        <Readouts
          items={[
            { label: 'Members', value: organization.memberCount },
            { label: 'Pending invites', value: canInvite ? (pendingCount ?? '—') : '—' },
            { label: 'Your role', value: <RoleBadge role={membership.role} label={membership.roleLabel} className="align-middle" /> },
          ]}
        />
      </StaggerItem>

      {canInvite && (
        <StaggerItem className="mb-6">
          <InviteForm
            key={organizationId}
            organizationName={organization.name}
            assignableRoles={assignableRoles}
            onInvited={(invitation) => {
              invitations.mutate((list) => [invitation, ...(list ?? []).filter((i) => i.id !== invitation.id)])
            }}
            onForbidden={() => onChanged({ refreshAccess: true })}
          />
        </StaggerItem>
      )}

      {canReadMembers ? (
        <StaggerItem className="mb-6">
          <MemberList
            resource={members}
            organizationName={organization.name}
            assignableRoles={assignableRoles}
            onChanged={onChanged}
          />
        </StaggerItem>
      ) : (
        <StaggerItem className="mb-6">
          <RestrictedNotice roleLabel={membership.roleLabel} />
        </StaggerItem>
      )}

      {canInvite && (
        <StaggerItem>
          <InvitationList resource={invitations} onChanged={onChanged} />
        </StaggerItem>
      )}
    </Stagger>
  )
}

function RestrictedNotice({ roleLabel }) {
  return (
    <section className="flex gap-4 rounded-xl bg-surface/95 p-5 ring-1 ring-line sm:p-6" aria-labelledby="restricted-heading">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-fg-subtle ring-1 ring-inset ring-line">
        <LockKeyhole size={17} strokeWidth={1.75} />
      </span>
      <div>
        <h2 id="restricted-heading" className="text-label font-medium text-fg">
          The member list isn't available to your role
        </h2>
        <p className="mt-1 text-body text-fg-muted">
          As {roleLabel}, you can use this organization but not view or manage its members. Owners, admins and security
          analysts can see who has access.
        </p>
      </div>
    </section>
  )
}
