import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Button, ErrorSummary, FieldMessage, SelectField, TextAreaField, TextField } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { useSessionStore } from '@/features/auth/sessionStore'
import { PageHeader, Panel, SkeletonRows, Stagger, StaggerItem } from '@/features/organization/components/PagePrimitives'
import { handleSessionLoss, useApiResource } from '@/features/organization/hooks/useApiResource'
import { can, useOrganization } from '@/features/organization/organizationContext'
import { cn } from '@/lib/cn'
import { AUTH_ERROR } from '@/services/auth/authErrors'
import { createAsset, getAsset, updateAsset } from '@/services/assets/assetApi'
import { ASSET_ERROR, describeAssetError } from '@/services/assets/assetErrors'
import { listMembers, paced } from '@/services/organization/organizationApi'
import {
  ASSET_CRITICALITIES,
  ASSET_ENVIRONMENTS,
  ASSET_EXPOSURES,
  ASSET_IDENTIFIER_KINDS,
  ASSET_LIMITS,
  ASSET_STATUS_TRANSITIONS,
  ASSET_STATUSES,
  ASSET_TYPES,
  TAG_PATTERN,
} from '../assetCatalog'
import { CriticalityMeter } from '../components/AssetSignals'
import { ChipInput } from '../components/ChipInput'

const L = ASSET_LIMITS
/** True if the text contains ASCII control characters (the server rejects them too). */
const hasControl = (text) => [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)

const EMPTY = {
  name: '',
  type: '',
  environment: '',
  criticality: '',
  exposure: 'unknown',
  status: 'active',
  description: '',
  identifiers: [],
  tags: [],
  technologies: [],
  team: '',
  contactUserId: '',
}

const FIELD_LABELS = {
  name: 'Name',
  type: 'Type',
  environment: 'Environment',
  criticality: 'Criticality',
  exposure: 'Exposure',
  status: 'Lifecycle',
  description: 'Description',
  tags: 'Tags',
  technologies: 'Technologies',
  team: 'Owning team',
  contactUserId: 'Contact',
}

function fromAsset(asset) {
  return {
    name: asset.name,
    type: asset.type,
    environment: asset.environment,
    criticality: asset.criticality,
    exposure: asset.exposure,
    status: asset.status,
    description: asset.description,
    identifiers: asset.identifiers.map(({ kind, value }, index) => ({ key: `i${index}`, kind, value })),
    tags: asset.tags,
    technologies: asset.technologies,
    team: asset.owner.team,
    contactUserId: asset.owner.contact?.userId ?? '',
  }
}

/** Client checks give fast feedback; the server re-validates everything (including identifier formats). */
function validate(values) {
  const errors = {}
  const name = values.name.trim()
  if (!name) errors.name = 'Name the asset'
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters'
  else if (hasControl(name)) errors.name = 'Remove control characters'
  if (!values.type) errors.type = 'Choose an asset type'
  if (!values.environment) errors.environment = 'Choose an environment'
  if (!values.criticality) errors.criticality = 'Choose a criticality'
  values.identifiers.forEach((identifier, index) => {
    if (!identifier.value.trim()) errors[`identifiers.${index}.value`] = 'Enter a value'
  })
  return errors
}

/** Server field keys → form keys (owner.* is flattened in the form). */
const fromServerField = (field) => ({ 'owner.team': 'team', 'owner.contactUserId': 'contactUserId' })[field] ?? field

export function AssetFormPage({ mode }) {
  const { assetId } = useParams()
  const organizationId = useSessionStore((s) => s.session?.organization?.id)
  const { details } = useOrganization()
  const editing = mode === 'edit'
  const asset = useApiResource(() => (editing ? getAsset(assetId) : Promise.resolve(null)), `${organizationId}:asset-form:${assetId ?? 'new'}`)
  const canPickContact = can(details, 'members:read')
  const members = useApiResource(
    () => (canPickContact ? listMembers().then((body) => body.members) : Promise.resolve([])),
    `${organizationId}:asset-form-members:${canPickContact}`,
  )

  const allowed = details && can(details, editing ? 'assets:update' : 'assets:create')
  const backTo = editing ? `/organization/assets/${assetId}` : '/organization/assets'

  if (details && !allowed) {
    return (
      <div className="max-w-xl">
        <BackLink to={backTo} label={editing ? 'Back to asset' : 'Assets'} />
        <Alert tone="warning" title={`You can't ${editing ? 'edit' : 'add'} assets`}>
          Your role in this organization can view the inventory but not change it. Ask a security analyst, admin or owner.
        </Alert>
      </div>
    )
  }

  if (!details || (editing && !asset.data)) {
    if (editing && asset.status === 'error') {
      return (
        <div className="max-w-xl">
          <BackLink to="/organization/assets" label="Assets" />
          <Alert tone="danger" title={asset.error?.code === 'NOT_FOUND' ? 'Asset not found' : describeAssetError(asset.error).title}>
            {asset.error?.code === 'NOT_FOUND' ? 'It may have been deleted, or it belongs to a different organization.' : describeAssetError(asset.error).body}
          </Alert>
        </div>
      )
    }
    return (
      <div className="rounded-xl bg-surface/95 ring-1 ring-line">
        <SkeletonRows rows={5} label="Loading form" />
      </div>
    )
  }

  if (editing && asset.data.archived) {
    return (
      <div className="max-w-xl">
        <BackLink to={backTo} label="Back to asset" />
        <Alert tone="warning" title="This asset is archived">
          Archived assets are read-only. Restore it from the asset page to make changes.
        </Alert>
      </div>
    )
  }

  return (
    <AssetForm
      key={editing ? `${asset.data.id}:${asset.data.revision}` : 'new'}
      existing={editing ? asset.data : null}
      members={members.data ?? []}
      canPickContact={canPickContact}
      onReload={() => asset.reload()}
      backTo={backTo}
    />
  )
}

function BackLink({ to, label }) {
  return (
    <Link
      to={to}
      className="group mb-4 inline-flex h-11 items-center gap-2 rounded-sm pr-2 text-label text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion"
    >
      <span className="grid size-7 place-items-center rounded-full ring-1 ring-inset ring-line transition-transform duration-[var(--duration-base)] group-hover:-translate-x-0.5">
        <ArrowLeft aria-hidden="true" size={14} />
      </span>
      {label}
    </Link>
  )
}

function AssetForm({ existing, members, canPickContact, onReload, backTo }) {
  const navigate = useNavigate()
  const [values, setValues] = useState(() => (existing ? fromAsset(existing) : EMPTY))
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const summaryRef = useRef(null)
  const nextKey = useRef(existing?.identifiers.length ?? 0)

  const clientErrors = validate(values)
  const errorFor = (field) => ((touched[field] || submitted ? clientErrors[field] : undefined) ?? serverErrors[field])
  const visibleErrors = Object.fromEntries(
    [...new Set([...Object.keys(clientErrors), ...Object.keys(serverErrors)])].map((field) => [field, errorFor(field)]).filter(([, message]) => message),
  )

  const set = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (serverErrors[field]) setServerErrors(({ [field]: _cleared, ...rest }) => rest)
  }
  const touch = (field) => setTouched((prev) => ({ ...prev, [field]: true }))

  const setIdentifier = (index, patch) => {
    setValues((prev) => ({ ...prev, identifiers: prev.identifiers.map((row, i) => (i === index ? { ...row, ...patch } : row)) }))
    const key = `identifiers.${index}.value`
    if (serverErrors[key] || serverErrors[`identifiers.${index}.kind`]) {
      setServerErrors(({ [key]: _a, [`identifiers.${index}.kind`]: _b, ...rest }) => rest)
    }
  }
  const addIdentifier = () => {
    const key = `n${nextKey.current++}`
    let index = 0
    flushSync(() =>
      setValues((prev) => {
        index = prev.identifiers.length
        return { ...prev, identifiers: [...prev.identifiers, { key, kind: 'url', value: '' }] }
      }),
    )
    document.getElementById(`identifiers.${index}.value`)?.focus()
  }
  const removeIdentifier = (index) => {
    // Server errors are index-based; drop them rather than show them on the wrong row.
    setServerErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !field.startsWith('identifiers.'))))
    setValues((prev) => ({ ...prev, identifiers: prev.identifiers.filter((_, i) => i !== index) }))
  }

  const focusFirstError = (errors) => {
    const fields = Object.keys(errors)
    if (fields.length > 1) return summaryRef.current?.focus()
    // Field keys double as element ids (including "identifiers.N.value"), so the error summary links work too.
    document.getElementById(fields[0])?.focus()
  }

  const payload = () => {
    const body = {
      name: values.name.trim(),
      type: values.type,
      environment: values.environment,
      criticality: values.criticality,
      exposure: values.exposure,
      status: values.status,
      description: values.description.trim(),
      identifiers: values.identifiers.map(({ kind, value }) => ({ kind, value: value.trim() })),
      tags: values.tags,
      technologies: values.technologies,
      owner: { team: values.team.trim(), ...(canPickContact ? { contactUserId: values.contactUserId || null } : {}) },
    }
    if (!existing) return body
    // Send only what changed, plus the revision this form was opened at.
    const before = fromAsset(existing)
    const changed = { revision: existing.revision }
    for (const key of ['name', 'type', 'environment', 'criticality', 'exposure', 'status', 'description', 'tags', 'technologies']) {
      if (JSON.stringify(body[key]) !== JSON.stringify(key === 'description' || key === 'name' ? before[key].trim() : before[key])) changed[key] = body[key]
    }
    if (JSON.stringify(body.identifiers) !== JSON.stringify(before.identifiers.map(({ kind, value }) => ({ kind, value })))) changed.identifiers = body.identifiers
    const owner = {}
    if (body.owner.team !== before.team) owner.team = body.owner.team
    if (canPickContact && (body.owner.contactUserId ?? '') !== before.contactUserId) owner.contactUserId = body.owner.contactUserId
    if (Object.keys(owner).length) changed.owner = owner
    return changed
  }

  const submit = async (event) => {
    event.preventDefault()
    if (submitting) return
    flushSync(() => setSubmitted(true))
    if (Object.keys(clientErrors).length) return focusFirstError(clientErrors)

    const body = payload()
    if (existing && Object.keys(body).length === 1) {
      navigate(backTo)
      return
    }

    setSubmitting(true)
    setFormError(null)
    setServerErrors({})
    try {
      const saved = await paced(existing ? updateAsset(existing.id, body) : createAsset(body), 600)
      navigate(`/organization/assets/${saved.id}`, { replace: Boolean(existing), state: { flash: { type: existing ? 'updated' : 'created' } } })
    } catch (error) {
      handleSessionLoss(error)
      const fields = error.meta?.fields
      if ((error.code === AUTH_ERROR.VALIDATION || error.code === ASSET_ERROR.IDENTIFIER_EXISTS) && fields && Object.keys(fields).length) {
        const mapped = Object.fromEntries(Object.entries(fields).map(([field, message]) => [fromServerField(field), message]))
        flushSync(() => setServerErrors(mapped))
        focusFirstError(mapped)
      } else {
        setFormError(error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const statusOptions = existing
    ? ASSET_STATUSES.filter((s) => s.value === existing.status || ASSET_STATUS_TRANSITIONS[existing.status].includes(s.value))
    : ASSET_STATUSES.filter((s) => s.value === 'planned' || s.value === 'active')

  const contactOptions = [
    { value: '', label: 'No contact' },
    ...members.map((member) => ({ value: member.userId, label: `${member.fullName} · ${member.roleLabel}` })),
  ]
  const formCopy = formError ? describeAssetError(formError, existing ? 'save these changes' : 'add this asset') : null
  const summaryLabels = {
    ...FIELD_LABELS,
    ...Object.fromEntries(values.identifiers.map((_, i) => [`identifiers.${i}.value`, `Identifier ${i + 1}`])),
    ...Object.fromEntries(values.identifiers.map((_, i) => [`identifiers.${i}.kind`, `Identifier ${i + 1} type`])),
  }

  return (
    <Stagger>
      <BackLink to={backTo} label={existing ? 'Back to asset' : 'Assets'} />
      <PageHeader eyebrow={existing ? `Edit · ${existing.typeLabel}` : 'Inventory · New asset'} title={existing ? `Edit ${existing.name}` : 'Add an asset'}>
        {existing
          ? 'Changes are recorded in the audit trail. If someone else saves first, you’ll be asked to reload.'
          : 'Describe something your organization needs to protect. You can refine it later.'}
      </PageHeader>

      <form noValidate onSubmit={submit} aria-label={existing ? 'Edit asset' : 'New asset'} className="space-y-6">
        <AnimatePresence initial={false}>
          {formCopy && (
            <Alert
              key="form-error"
              tone="danger"
              title={formCopy.title}
              action={
                formError.code === ASSET_ERROR.CONFLICT && (
                  <Button variant="secondary" size="md" onClick={onReload}>
                    Reload latest version
                  </Button>
                )
              }
            >
              {formCopy.body}
              {formError.code === ASSET_ERROR.CONFLICT && ' Reloading discards the changes in this form.'}
            </Alert>
          )}
          {submitted && Object.keys(visibleErrors).length > 1 && (
            <ErrorSummary key="summary" ref={summaryRef} errors={visibleErrors} fieldLabels={summaryLabels} />
          )}
        </AnimatePresence>

        <StaggerItem>
          <Panel headingId="identity-heading" eyebrow="01 · Identity" title="What is it?">
            <div className="grid gap-x-5 px-5 pt-5 sm:px-6 md:grid-cols-2">
              <TextField
                id="name"
                label="Name"
                placeholder="Production API"
                maxLength={L.nameMax}
                autoComplete="off"
                value={values.name}
                error={errorFor('name')}
                onChange={(e) => set('name', e.target.value)}
                onBlur={() => values.name && touch('name')}
              />
              <SelectField
                id="type"
                label="Type"
                value={values.type}
                error={errorFor('type')}
                options={[{ value: '', label: 'Choose a type' }, ...ASSET_TYPES]}
                onChange={(e) => set('type', e.target.value)}
                onBlur={() => touch('type')}
              />
              <TextAreaField
                id="description"
                className="md:col-span-2"
                label="Description"
                rows={3}
                maxLength={L.descriptionMax}
                placeholder="What it does, what data it handles, anything a responder should know."
                value={values.description}
                error={errorFor('description')}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
          </Panel>
        </StaggerItem>

        <StaggerItem>
          <Panel headingId="context-heading" eyebrow="02 · Security context" title="How much does it matter?">
            <div className="px-5 pt-5 sm:px-6">
              <CriticalityChoice value={values.criticality} error={errorFor('criticality')} onChange={(v) => set('criticality', v)} />
              <div className="grid gap-x-5 md:grid-cols-3">
                <SelectField
                  id="environment"
                  label="Environment"
                  value={values.environment}
                  error={errorFor('environment')}
                  options={[{ value: '', label: 'Choose an environment' }, ...ASSET_ENVIRONMENTS]}
                  onChange={(e) => set('environment', e.target.value)}
                  onBlur={() => touch('environment')}
                />
                <SelectField
                  id="exposure"
                  label="Exposure"
                  value={values.exposure}
                  error={errorFor('exposure')}
                  hint="Reachable from the internet?"
                  options={ASSET_EXPOSURES}
                  onChange={(e) => set('exposure', e.target.value)}
                />
                <SelectField
                  id="status"
                  label="Lifecycle"
                  value={values.status}
                  error={errorFor('status')}
                  hint={existing ? 'Only valid next stages are listed' : undefined}
                  options={statusOptions}
                  onChange={(e) => set('status', e.target.value)}
                />
              </div>
            </div>
          </Panel>
        </StaggerItem>

        <StaggerItem>
          <Panel
            headingId="identifiers-heading"
            eyebrow="03 · Identifiers"
            title="How is it recognised?"
            description="URLs, hostnames, IPs, repositories, image references. Future scanners match on these, so each must be unique in the organization."
          >
            <div className="px-5 pb-2 pt-5 sm:px-6">
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {values.identifiers.map((identifier, index) => {
                    const kind = ASSET_IDENTIFIER_KINDS.find((k) => k.value === identifier.kind)
                    const valueError = errorFor(`identifiers.${index}.value`)
                    const kindError = errorFor(`identifiers.${index}.kind`)
                    return (
                      <motion.li
                        key={identifier.key}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.enter } }}
                        exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.exit } }}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
                      >
                        <SelectField
                          compact
                          id={`identifiers.${index}.kind`}
                          aria-label={`Identifier ${index + 1} type`}
                          value={identifier.kind}
                          options={ASSET_IDENTIFIER_KINDS}
                          onChange={(e) => setIdentifier(index, { kind: e.target.value })}
                          className="col-span-2 mb-2 sm:col-span-1 sm:mb-0"
                          selectClassName={cn(kindError && 'ring-danger/70')}
                        />
                        <div className="min-w-0">
                          <input
                            id={`identifiers.${index}.value`}
                            aria-label={`Identifier ${index + 1} value`}
                            aria-invalid={Boolean(valueError) || undefined}
                            aria-describedby={`identifiers.${index}.message`}
                            value={identifier.value}
                            maxLength={512}
                            placeholder={kind?.placeholder}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => setIdentifier(index, { value: e.target.value })}
                            className={cn(
                              'block h-11 w-full rounded-md bg-surface-well px-3 font-mono text-body text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] ring-1 ring-inset placeholder:text-fg-subtle',
                              'transition-[box-shadow] duration-[var(--duration-fast)] focus:outline-none focus:ring-2',
                              valueError ? 'ring-danger/70 focus:ring-danger' : 'ring-line hover:ring-line-strong focus:ring-ion/80',
                            )}
                          />
                          <FieldMessage id={`identifiers.${index}.message`} error={valueError ?? kindError} />
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove identifier ${index + 1}`}
                          onClick={() => removeIdentifier(index)}
                          className="grid size-11 place-items-center rounded-sm text-fg-subtle transition-colors hover:bg-surface-hover hover:text-danger focus-visible:outline-2 focus-visible:outline-ion"
                        >
                          <X aria-hidden="true" size={16} />
                        </button>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
              {values.identifiers.length === 0 && <p className="pb-3 text-body text-fg-subtle">No identifiers yet.</p>}
              <Button
                variant="secondary"
                size="md"
                className="mb-4 mt-1"
                disabled={values.identifiers.length >= L.identifiersMax}
                leadingIcon={<Plus aria-hidden="true" size={15} />}
                onClick={addIdentifier}
              >
                Add identifier
              </Button>
            </div>
          </Panel>
        </StaggerItem>

        <StaggerItem>
          <Panel headingId="classification-heading" eyebrow="04 · Classification" title="Tags and technologies">
            <div className="grid gap-x-5 px-5 pt-5 sm:px-6 md:grid-cols-2">
              <ChipInput
                id="tags"
                label="Tags"
                mono
                values={values.tags}
                max={L.tagsMax}
                placeholder="pci, payments, team:core"
                normalize={(v) => v.trim().toLowerCase()}
                validate={(v) => (v.length > L.tagMax ? `Up to ${L.tagMax} characters` : !TAG_PATTERN.test(v) ? 'Letters, numbers and . _ : / -' : undefined)}
                error={errorFor('tags')}
                onChange={(next) => set('tags', next)}
              />
              <ChipInput
                id="technologies"
                label="Technologies"
                values={values.technologies}
                max={L.technologiesMax}
                placeholder="Node.js, PostgreSQL"
                validate={(v) => (v.length > L.technologyMax ? `Up to ${L.technologyMax} characters` : hasControl(v) ? 'Remove control characters' : undefined)}
                hint="Labels only — versioned inventory comes later"
                error={errorFor('technologies')}
                onChange={(next) => set('technologies', next)}
              />
            </div>
          </Panel>
        </StaggerItem>

        <StaggerItem>
          <Panel headingId="ownership-heading" eyebrow="05 · Ownership" title="Who is accountable?">
            <div className="grid gap-x-5 px-5 pt-5 sm:px-6 md:grid-cols-2">
              <TextField
                id="team"
                label="Owning team"
                required={false}
                placeholder="Backend Team"
                maxLength={L.teamMax}
                autoComplete="off"
                value={values.team}
                error={errorFor('team')}
                onChange={(e) => set('team', e.target.value)}
              />
              {canPickContact ? (
                <SelectField
                  id="contactUserId"
                  label="Contact"
                  value={values.contactUserId}
                  error={errorFor('contactUserId')}
                  hint="A current member of this organization"
                  options={contactOptions}
                  onChange={(e) => set('contactUserId', e.target.value)}
                />
              ) : (
                <p className="self-center pb-4 text-caption text-fg-subtle">Your role can't list members, so the contact can't be changed here.</p>
              )}
            </div>
          </Panel>
        </StaggerItem>

        <StaggerItem className="flex flex-col-reverse gap-3 border-t border-line-subtle pt-6 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => navigate(backTo)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} loadingLabel={existing ? 'Saving…' : 'Adding asset…'}>
            {existing ? 'Save changes' : 'Add asset'}
          </Button>
        </StaggerItem>
        <p className="sr-only" role="status">
          {submitting ? (existing ? 'Saving asset' : 'Adding asset') : ''}
        </p>
      </form>
    </Stagger>
  )
}

/** Criticality as four radio cards with the meter, a label and guidance. Native radios keep keyboard behavior. */
function CriticalityChoice({ value, error, onChange }) {
  return (
    <fieldset className="pb-2" aria-describedby="criticality-message">
      <legend className="text-label text-fg">Criticality</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ASSET_CRITICALITIES.map((option, index) => {
          const checked = value === option.value
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex min-h-11 cursor-pointer flex-col gap-1.5 rounded-md bg-surface-well p-3 ring-1 ring-inset transition-[box-shadow,background-color] duration-[var(--duration-fast)]',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ion',
                checked ? 'bg-surface-hover ring-ion/60' : error ? 'ring-danger/60' : 'ring-line hover:ring-line-strong',
              )}
            >
              <input
                type="radio"
                name="criticality"
                id={index === 0 ? 'criticality' : undefined}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <CriticalityMeter criticality={option.value} label={option.label} />
              <span className="text-caption text-fg-subtle">{option.hint}</span>
            </label>
          )
        })}
      </div>
      <FieldMessage id="criticality-message" error={error} />
    </fieldset>
  )
}
