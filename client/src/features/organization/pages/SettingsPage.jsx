import { AnimatePresence } from 'framer-motion'
import { Building2, Check, Minus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Button, TextField } from '@/design-system/components'
import { sessionActions } from '@/features/auth/sessionStore'
import { AUTH_ERROR } from '@/services/auth/authErrors'
import { paced, updateOrganization } from '@/services/organization/organizationApi'
import { describeOrganizationError } from '@/services/organization/organizationErrors'
import { cn } from '@/lib/cn'
import { handleSessionLoss } from '../hooks/useApiResource'
import { RoleBadge } from '../components/Identity'
import { PageHeader, Panel, SkeletonRows, Stagger, StaggerItem } from '../components/PagePrimitives'
import { can, useOrganization } from '../organizationContext'

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

/** Organization-management capabilities that exist today, in plain language. */
const CAPABILITIES = [
  { permission: 'organization:read', label: 'View this organization' },
  { permission: 'organization:update', label: 'Change organization settings' },
  { permission: 'members:read', label: 'See who is a member' },
  { permission: 'members:invite', label: 'Invite people and manage invitations' },
  { permission: 'members:update_role', label: 'Change member roles' },
  { permission: 'members:remove', label: 'Remove members' },
]

function validateName(value) {
  const name = value.trim()
  if (!name) return 'Name your workspace'
  if (name.length < 2) return 'Workspace name must be at least 2 characters'
  if (name.length > 60) return 'Workspace name must be 60 characters or fewer'
  return undefined
}

export function SettingsPage() {
  const { details, status } = useOrganization()

  if (!details) {
    return (
      <div className="rounded-xl bg-surface/95 ring-1 ring-line">
        <SkeletonRows rows={3} label={status === 'loading' ? 'Loading organization' : 'Organization unavailable'} />
      </div>
    )
  }

  const { organization, membership } = details
  const editable = can(details, 'organization:update')

  return (
    <Stagger>
      <PageHeader eyebrow={`${organization.name} · Settings`} title="Organization settings">
        {editable
          ? 'Details that identify this organization to its members.'
          : 'Details that identify this organization. Only owners and admins can change them.'}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <StaggerItem>
            <ProfilePanel key={organization.id} details={details} editable={editable} />
          </StaggerItem>
          <StaggerItem>
            <Panel headingId="details-heading" eyebrow="Record" title="Details">
              <dl className="divide-y divide-line-subtle">
                {[
                  { term: 'Organization ID', value: organization.id, mono: true },
                  { term: 'Slug', value: organization.slug, mono: true },
                  { term: 'Created', value: dateFormat.format(new Date(organization.createdAt)) },
                  { term: 'Members', value: organization.memberCount },
                ].map((row) => (
                  <div key={row.term} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3.5 sm:px-6">
                    <dt className="eyebrow text-fg-subtle">{row.term}</dt>
                    <dd className={cn('min-w-0 break-all text-label text-fg tabular', row.mono && 'font-mono text-caption')}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </StaggerItem>
        </div>

        <StaggerItem>
          <Panel
            headingId="access-heading"
            eyebrow="Your access"
            title={<span className="flex flex-wrap items-center gap-2">What your role allows <RoleBadge role={membership.role} label={membership.roleLabel} /></span>}
            description="Enforced by the server on every request."
          >
            <ul className="space-y-2.5 px-5 py-5 sm:px-6">
              {CAPABILITIES.map((item) => {
                const allowed = can(details, item.permission)
                return (
                  <li key={item.permission} className={cn('flex items-center gap-2.5 text-caption', allowed ? 'text-fg-muted' : 'text-fg-subtle')}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full',
                        allowed ? 'bg-success/15 text-success' : 'bg-ink-600 text-fg-subtle',
                      )}
                    >
                      {allowed ? <Check size={12} strokeWidth={3} /> : <Minus size={12} strokeWidth={3} />}
                    </span>
                    {item.label}
                    <span className="sr-only">{allowed ? '— allowed' : '— not allowed'}</span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </StaggerItem>
      </div>
    </Stagger>
  )
}

function ProfilePanel({ details, editable }) {
  const { reload } = useOrganization()
  const { organization } = details
  const [name, setName] = useState(organization.name)
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [error, setError] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | saving | saved
  const inputRef = useRef(null)

  useEffect(() => {
    if (phase !== 'saved') return undefined
    const id = setTimeout(() => setPhase('idle'), 1800)
    return () => clearTimeout(id)
  }, [phase])

  const dirty = name.trim() !== organization.name
  const fieldError = (touched ? validateName(name) : undefined) ?? serverError

  const save = async (event) => {
    event.preventDefault()
    if (phase === 'saving' || !editable) return
    flushSync(() => setTouched(true))
    if (validateName(name)) {
      inputRef.current?.focus()
      return
    }
    if (!dirty) return
    setPhase('saving')
    setError(null)
    setServerError(null)
    try {
      const updated = await paced(updateOrganization({ name: name.trim() }), 600)
      setName(updated.organization.name)
      setPhase('saved')
      setTouched(false)
      reload({ quiet: true })
      sessionActions.refresh() // header + switcher show the new name
    } catch (err) {
      handleSessionLoss(err)
      setPhase('idle')
      if (err.code === AUTH_ERROR.VALIDATION && err.meta?.fields?.name) {
        flushSync(() => setServerError(err.meta.fields.name))
        inputRef.current?.focus()
      } else {
        setError(err)
        if (err.code === AUTH_ERROR.FORBIDDEN) reload({ quiet: true })
      }
    }
  }

  const copy = error ? describeOrganizationError(error, 'rename this organization') : null

  return (
    <Panel headingId="profile-heading" eyebrow="Profile" title="Organization name">
      <form noValidate onSubmit={save} aria-labelledby="profile-heading" className="px-5 pb-5 pt-5 sm:px-6">
        <AnimatePresence initial={false}>
          {copy && (
            <Alert key="error" tone="danger" title={copy.title} className="mb-5">
              {copy.body}
            </Alert>
          )}
        </AnimatePresence>
        <TextField
          ref={inputRef}
          id="organization-name"
          label="Name"
          autoComplete="organization"
          leadingIcon={<Building2 size={17} strokeWidth={1.75} />}
          value={name}
          readOnly={!editable}
          aria-readonly={!editable || undefined}
          error={fieldError}
          hint={editable ? 'Shown to members, in invitations and in the organization switcher.' : 'Read-only for your role.'}
          onChange={(event) => {
            setName(event.target.value)
            if (serverError) setServerError(null)
          }}
          onBlur={() => setTouched(true)}
          inputClassName={cn(!editable && 'cursor-default text-fg-muted')}
        />
        {editable && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
            {dirty && phase === 'idle' && (
              <Button variant="ghost" size="md" onClick={() => { setName(organization.name); setTouched(false); setServerError(null) }}>
                Discard
              </Button>
            )}
            <Button
              type="submit"
              size="md"
              disabled={!dirty && phase === 'idle'}
              loading={phase === 'saving'}
              success={phase === 'saved'}
              loadingLabel="Saving…"
              successLabel="Saved"
            >
              Save changes
            </Button>
          </div>
        )}
        <p className="sr-only" role="status">
          {phase === 'saving' ? 'Saving organization name' : phase === 'saved' ? 'Organization name saved' : ''}
        </p>
      </form>
    </Panel>
  )
}
