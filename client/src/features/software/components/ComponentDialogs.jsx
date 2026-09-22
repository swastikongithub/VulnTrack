import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { Alert, Button, Dialog, SelectField, TextField } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { handleSessionLoss, useApiResource } from '@/features/organization/hooks/useApiResource'
import { listAssets } from '@/services/assets/assetApi'
import { AUTH_ERROR } from '@/services/auth/authErrors'
import { paced } from '@/services/organization/organizationApi'
import { createComponent, deleteComponent, updateComponent } from '@/services/software/softwareApi'
import { describeSoftwareError, SOFTWARE_ERROR } from '@/services/software/softwareErrors'
import { normalizeComponent } from '../componentIdentity'
import { ecosystemOf, SOFTWARE_ECOSYSTEMS, SOFTWARE_LIMITS, SOFTWARE_RELATIONSHIPS, SOFTWARE_SCOPES } from '../softwareCatalog'

/** Errors that mean the list on screen is out of date: the parent reloads it. */
const STALE = [SOFTWARE_ERROR.CONFLICT, 'NOT_FOUND', 'ASSET_ARCHIVED', 'FORBIDDEN']

const NAME_LABELS = {
  maven: 'groupId:artifactId',
  go: 'Module path',
  packagist: 'vendor/package',
  generic: 'Product',
}

const FIELD_IDS = {
  assetId: 'component-asset',
  ecosystem: 'component-ecosystem',
  name: 'component-name',
  vendor: 'component-vendor',
  version: 'component-version',
  relationship: 'component-relationship',
  scope: 'component-scope',
}

function initialValues(component, asset) {
  if (component) {
    return {
      assetId: component.asset?.id ?? '',
      ecosystem: component.ecosystem,
      name: component.name,
      vendor: component.vendor ?? '',
      version: component.version ?? '',
      relationship: component.relationship,
      scope: component.scope,
    }
  }
  return { assetId: asset?.id ?? '', ecosystem: 'npm', name: '', vendor: '', version: '', relationship: 'unknown', scope: 'unknown' }
}

/** Live assets for the picker (first 100 by name). */
function AssetPicker({ value, error, onChange }) {
  const assets = useApiResource(() => listAssets({ pageSize: 100, sort: 'name' }), 'software:asset-picker')
  if (assets.status === 'loading') {
    return <SelectField id={FIELD_IDS.assetId} label="Asset" options={[{ value: '', label: 'Loading assets…' }]} value="" disabled onChange={() => {}} />
  }
  if (assets.status === 'error') {
    return (
      <Alert tone="danger" title="Couldn't load assets" className="mb-4">
        {describeSoftwareError(assets.error, 'load assets').body}
      </Alert>
    )
  }
  const list = assets.data.assets
  if (list.length === 0) {
    return (
      <Alert tone="info" title="No assets yet" className="mb-4">
        Software is recorded against an asset. Add an asset first.
      </Alert>
    )
  }
  return (
    <SelectField
      id={FIELD_IDS.assetId}
      label="Asset"
      value={value}
      error={error}
      hint={assets.data.total > list.length ? 'Showing the first 100 assets. For others, add software from the asset page.' : undefined}
      options={[{ value: '', label: 'Choose an asset' }, ...list.map((a) => ({ value: a.id, label: a.name }))]}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/**
 * Add or edit a software component. `asset` fixes the parent asset (asset
 * page); without it, adding shows an asset picker (software page). Validates
 * with the same rules as the server and previews the Package URL the server
 * will derive.
 */
export function ComponentEditorDialog({ component, asset, onClose, onSaved, onStale }) {
  const editing = Boolean(component)
  const [values, setValues] = useState(() => initialValues(component, asset))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const firstFieldRef = useRef(null)

  const ecosystem = ecosystemOf(values.ecosystem)
  const preview = normalizeComponent(values)
  const set = (key) => (event) => {
    const value = event.target.value
    setValues((prev) => ({ ...prev, [key]: value, ...(key === 'ecosystem' && value !== 'generic' ? { vendor: '' } : {}) }))
    setErrors((prev) => ({ ...prev, [key]: undefined, ...(key === 'ecosystem' ? { name: undefined, version: undefined } : {}) }))
  }

  const focusFirstError = (fields) => {
    const first = Object.keys(FIELD_IDS).find((key) => fields[key])
    if (first) requestAnimationFrame(() => document.getElementById(FIELD_IDS[first])?.focus())
  }

  function payload() {
    const full = {
      ecosystem: values.ecosystem,
      name: values.name.trim(),
      vendor: values.ecosystem === 'generic' ? values.vendor.trim() : '',
      version: values.version.trim() || null,
      relationship: values.relationship,
      scope: values.scope,
    }
    if (!editing) return full
    // Edits send only what changed, plus the revision that was read.
    const before = initialValues(component)
    const changes = { revision: component.revision }
    const identityChanged = ['ecosystem', 'name', 'vendor', 'version'].some((key) => (values[key] ?? '').trim() !== (before[key] ?? '').trim())
    if (identityChanged) Object.assign(changes, { ecosystem: full.ecosystem, name: full.name, vendor: full.vendor, version: full.version })
    for (const key of ['relationship', 'scope']) if (values[key] !== before[key]) changes[key] = values[key]
    return changes
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const fields = { ...(preview.fields ?? {}) }
    if (!editing && !values.assetId) fields.assetId = 'Choose an asset'
    setFormError(null)
    if (Object.keys(fields).length) {
      setErrors(fields)
      focusFirstError(fields)
      return
    }
    const body = payload()
    if (editing && Object.keys(body).length === 1) return onClose()

    setBusy(true)
    try {
      const saved = await paced(editing ? updateComponent(component.id, body) : createComponent(values.assetId, body))
      onSaved(saved)
    } catch (error) {
      handleSessionLoss(error)
      const serverFields = error.meta?.fields
      if ((error.code === AUTH_ERROR.VALIDATION || error.code === SOFTWARE_ERROR.COMPONENT_EXISTS) && serverFields && !serverFields.form) {
        setErrors(serverFields)
        focusFirstError(serverFields)
      } else {
        setFormError(describeSoftwareError(error, editing ? 'save this component' : 'add this component'))
        if (STALE.includes(error.code)) onStale?.()
      }
    } finally {
      setBusy(false)
    }
  }

  const title = editing ? `Edit ${component.name}` : asset ? `Add software to ${asset.name}` : 'Add a software component'

  return (
    <Dialog
      title={title}
      description={editing ? `On ${component.asset?.name ?? 'this asset'}.` : 'Record a package or product and the version this asset runs.'}
      initialFocusRef={firstFieldRef}
      onClose={() => !busy && onClose()}
      className="w-[min(34rem,calc(100vw-2rem))]"
    >
      <form noValidate onSubmit={submit}>
        <AnimatePresence initial={false}>
          {formError && (
            <Alert key="error" tone="danger" title={formError.title} className="mb-4">
              {formError.body}
            </Alert>
          )}
        </AnimatePresence>

        {!editing && !asset && (
          <AssetPicker value={values.assetId} error={errors.assetId} onChange={(assetId) => set('assetId')({ target: { value: assetId } })} />
        )}

        <div className="grid gap-x-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <SelectField
            ref={firstFieldRef}
            id={FIELD_IDS.ecosystem}
            label="Ecosystem"
            value={values.ecosystem}
            error={errors.ecosystem}
            options={SOFTWARE_ECOSYSTEMS.map(({ value, label }) => ({ value, label }))}
            onChange={set('ecosystem')}
          />
          <TextField
            id={FIELD_IDS.name}
            label={NAME_LABELS[values.ecosystem] ?? 'Package'}
            value={values.name}
            error={errors.name}
            placeholder={ecosystem?.namePlaceholder}
            maxLength={SOFTWARE_LIMITS.nameMax}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            inputClassName="font-mono text-label"
            onChange={set('name')}
          />
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField
            id={FIELD_IDS.version}
            label="Version"
            required={false}
            value={values.version}
            error={errors.version}
            hint={errors.version ? undefined : 'Leave empty if unknown'}
            placeholder={ecosystem?.versionPlaceholder}
            maxLength={SOFTWARE_LIMITS.versionMax}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            inputClassName="font-mono text-label"
            onChange={set('version')}
          />
          {values.ecosystem === 'generic' && (
            <TextField
              id={FIELD_IDS.vendor}
              label="Vendor"
              required={false}
              value={values.vendor}
              error={errors.vendor}
              hint={errors.vendor ? undefined : 'Optional, e.g. F5 or PostgreSQL Global Development Group'}
              maxLength={SOFTWARE_LIMITS.vendorMax}
              autoComplete="off"
              onChange={set('vendor')}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4">
          <SelectField id={FIELD_IDS.relationship} label="Dependency" value={values.relationship} options={SOFTWARE_RELATIONSHIPS} onChange={set('relationship')} />
          <SelectField id={FIELD_IDS.scope} label="Scope" value={values.scope} options={SOFTWARE_SCOPES} onChange={set('scope')} />
        </div>

        <div className="mt-1 rounded-md bg-surface-well px-3.5 py-3 ring-1 ring-inset ring-line">
          <p className="eyebrow text-fg-subtle">Package URL</p>
          <div className="mt-1.5 min-h-5 overflow-hidden" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={preview.purl ?? 'none'}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: duration.fast, ease: ease.enter } }}
                exit={{ opacity: 0, transition: { duration: duration.instant, ease: ease.exit } }}
                className="break-all font-mono text-caption text-ion"
              >
                {preview.purl ?? <span className="text-fg-subtle">Appears once the name is valid</span>}
              </motion.p>
            </AnimatePresence>
          </div>
          {preview.purl && !preview.versionNormalized && (
            <p className="mt-1.5 text-caption text-warning">Without a version, this can’t be checked against affected version ranges later.</p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="md" loading={busy} loadingLabel={editing ? 'Saving…' : 'Adding…'}>
            {editing ? 'Save changes' : 'Add component'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Confirms removal of one component. Focus starts on Cancel. */
export function RemoveComponentDialog({ component, onClose, onRemoved, onStale }) {
  const cancelRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const label = `${component.name}${component.version ? ` ${component.version}` : ''}`

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await paced(deleteComponent(component.id))
      onRemoved(component)
    } catch (err) {
      handleSessionLoss(err)
      setError(describeSoftwareError(err, 'remove this component'))
      if (STALE.includes(err.code)) onStale?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      tone="danger"
      title={`Remove ${label}?`}
      description={
        <>
          It will no longer be listed for <span className="text-fg">{component.asset?.name ?? 'this asset'}</span>. The audit log keeps a
          record of the change.
        </>
      }
      initialFocusRef={cancelRef}
      onClose={() => !busy && onClose()}
    >
      {error && (
        <Alert tone="danger" title={error.title} className="mb-4">
          {error.body}
        </Alert>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button ref={cancelRef} variant="secondary" size="md" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" size="md" loading={busy} loadingLabel="Removing…" onClick={remove}>
          Remove component
        </Button>
      </div>
    </Dialog>
  )
}
