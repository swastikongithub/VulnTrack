import { AnimatePresence } from 'framer-motion'
import { Archive, ArrowLeft, Check, Copy, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Alert, Button, Dialog, TextField } from '@/design-system/components'
import { useSessionStore } from '@/features/auth/sessionStore'
import { PageHeader, Panel, SkeletonRows, Stagger, StaggerItem } from '@/features/organization/components/PagePrimitives'
import { handleSessionLoss, useApiResource } from '@/features/organization/hooks/useApiResource'
import { archiveAsset, deleteAsset, getAsset, restoreAsset } from '@/services/assets/assetApi'
import { describeAssetError } from '@/services/assets/assetErrors'
import { paced } from '@/services/organization/organizationApi'
import { useClearFlashOnce } from '../useFlash'
import { ArchivedChip, AssetTypeIcon, CriticalityMeter, ExposureChip, LifecycleChip, MetaChip, TagList } from '../components/AssetSignals'

const dateTime = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const when = (iso) => (iso ? dateTime.format(new Date(iso)) : null)

export function AssetDetailPage() {
  const { assetId } = useParams()
  const organizationId = useSessionStore((s) => s.session?.organization?.id)
  const resource = useApiResource(() => getAsset(assetId), `${organizationId}:asset:${assetId}`)

  if (resource.status === 'loading' && !resource.data) {
    return (
      <>
        <BackToInventory />
        <div className="rounded-xl bg-surface/95 ring-1 ring-line">
          <SkeletonRows rows={4} label="Loading asset" />
        </div>
      </>
    )
  }

  if (!resource.data) {
    const notFound = resource.error?.code === 'NOT_FOUND'
    const copy = describeAssetError(resource.error, 'load this asset')
    return (
      <>
        <BackToInventory />
        <div className="max-w-xl">
          <Alert
            tone={notFound ? 'warning' : 'danger'}
            title={notFound ? 'Asset not found' : copy.title}
            action={
              !notFound && (
                <Button variant="secondary" size="md" onClick={() => resource.reload()}>
                  Try again
                </Button>
              )
            }
          >
            {notFound ? 'It may have been deleted, or it belongs to a different organization.' : copy.body}
          </Alert>
        </div>
      </>
    )
  }

  return <AssetDetail asset={resource.data} replace={(next) => resource.mutate(() => next)} reload={resource.reload} />
}

function BackToInventory() {
  return (
    <Link
      to="/organization/assets"
      className="group mb-4 inline-flex h-11 items-center gap-2 rounded-sm pr-2 text-label text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion"
    >
      <span className="grid size-7 place-items-center rounded-full ring-1 ring-inset ring-line transition-transform duration-[var(--duration-base)] group-hover:-translate-x-0.5">
        <ArrowLeft aria-hidden="true" size={14} />
      </span>
      Assets
    </Link>
  )
}

function AssetDetail({ asset, replace, reload }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [flash, setFlash] = useState(location.state?.flash ?? null)
  useClearFlashOnce(location, navigate)
  const [busy, setBusy] = useState(null) // 'archive' | 'restore' | 'delete'
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(null) // 'archive' | 'delete'
  const [confirmName, setConfirmName] = useState('')
  const cancelRef = useRef(null)

  const run = async (kind, work) => {
    setBusy(kind)
    setError(null)
    setFlash(null)
    try {
      await work()
    } catch (err) {
      handleSessionLoss(err)
      setError(err)
      setConfirming(null)
      if (['ASSET_CONFLICT', 'FORBIDDEN', 'ASSET_ARCHIVED', 'ASSET_NOT_ARCHIVED'].includes(err.code)) reload({ quiet: true })
    } finally {
      setBusy(null)
    }
  }

  const archive = () =>
    run('archive', async () => {
      const next = await paced(archiveAsset(asset.id, asset.revision))
      setConfirming(null)
      replace(next)
      setFlash({ type: 'archived' })
    })

  const restore = () =>
    run('restore', async () => {
      replace(await paced(restoreAsset(asset.id, asset.revision)))
      setFlash({ type: 'restored' })
    })

  const remove = () =>
    run('delete', async () => {
      await paced(deleteAsset(asset.id))
      navigate('/organization/assets?archived=true', { replace: true, state: { flash: { type: 'deleted', name: asset.name } } })
    })

  const errorCopy = error ? describeAssetError(error, busy ? `${busy} this asset` : 'change this asset') : null
  const flashCopy = {
    created: ['Asset added', `${asset.name} is now part of the inventory.`],
    updated: ['Changes saved', 'The asset record is up to date.'],
    archived: ['Asset archived', 'It no longer appears in the live inventory. Restore it any time.'],
    restored: ['Asset restored', 'It is back in the live inventory.'],
  }[flash?.type]

  return (
    <Stagger>
      <BackToInventory />
      <PageHeader
        eyebrow={`${asset.typeLabel} · ${asset.environmentLabel}`}
        title={
          <span className="flex items-center gap-4">
            <AssetTypeIcon type={asset.type} size="lg" className="max-sm:hidden" />
            <span className="min-w-0 break-words">{asset.name}</span>
          </span>
        }
        aside={
          <div className="flex flex-wrap gap-2">
            {asset.actions.update && (
              <Button size="md" leadingIcon={<Pencil aria-hidden="true" size={15} />} onClick={() => navigate(`/organization/assets/${asset.id}/edit`)}>
                Edit
              </Button>
            )}
            {asset.actions.archive && (
              <Button variant="secondary" size="md" leadingIcon={<Archive aria-hidden="true" size={15} />} onClick={() => setConfirming('archive')}>
                Archive
              </Button>
            )}
          </div>
        }
      >
        <span className="flex flex-wrap items-center gap-2">
          <CriticalityMeter criticality={asset.criticality} label={asset.criticalityLabel} className="mr-1" />
          {asset.archived ? <ArchivedChip /> : <LifecycleChip status={asset.status} label={asset.statusLabel} />}
          <ExposureChip exposure={asset.exposure} label={asset.exposureLabel} />
          <MetaChip>{asset.environmentLabel}</MetaChip>
        </span>
      </PageHeader>

      <AnimatePresence initial={false}>
        {errorCopy && (
          <Alert key="error" tone="danger" title={errorCopy.title} className="mb-6">
            {errorCopy.body}
          </Alert>
        )}
        {flashCopy && !errorCopy && (
          <Alert key={`flash-${flash.type}`} tone="success" title={flashCopy[0]} className="mb-6">
            {flashCopy[1]}
          </Alert>
        )}
      </AnimatePresence>

      {asset.archived && (
        <StaggerItem className="mb-6">
          <Alert
            tone="warning"
            title="This asset is archived"
            action={
              (asset.actions.restore || asset.actions.delete) && (
                <div className="flex flex-wrap gap-2">
                  {asset.actions.restore && (
                    <Button variant="secondary" size="md" loading={busy === 'restore'} loadingLabel="Restoring…" leadingIcon={<RotateCcw aria-hidden="true" size={15} />} onClick={restore}>
                      Restore
                    </Button>
                  )}
                  {asset.actions.delete && (
                    <Button variant="ghost" size="md" className="hover:text-danger" leadingIcon={<Trash2 aria-hidden="true" size={15} />} onClick={() => setConfirming('delete')}>
                      Delete permanently
                    </Button>
                  )}
                </div>
              )
            }
          >
            Archived {when(asset.archivedAt)}
            {asset.archivedBy ? ` by ${asset.archivedBy.fullName}` : ''}. It's read-only and hidden from the live inventory.
          </Alert>
        </StaggerItem>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <StaggerItem>
            <Panel headingId="overview-heading" eyebrow="Overview" title="Context">
              <div className="px-5 py-5 sm:px-6">
                {asset.description ? (
                  <p className="whitespace-pre-line break-words text-body text-fg-muted">{asset.description}</p>
                ) : (
                  <p className="text-body text-fg-subtle">No description.</p>
                )}
              </div>
              <Facts
                rows={[
                  ['Type', asset.typeLabel],
                  ['Environment', asset.environmentLabel],
                  ['Criticality', asset.criticalityLabel],
                  ['Exposure', asset.exposureLabel],
                  ['Lifecycle', asset.statusLabel],
                ]}
              />
            </Panel>
          </StaggerItem>

          <StaggerItem>
            <Panel
              headingId="identifiers-heading"
              eyebrow="Identity"
              title="Identifiers"
              description="How scanners and imports will recognise this asset. Each identifier is unique within the organization."
            >
              {asset.identifiers.length ? (
                <ul className="divide-y divide-line-subtle">
                  {asset.identifiers.map((identifier) => (
                    <IdentifierRow key={`${identifier.kind}:${identifier.value}`} identifier={identifier} />
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-5 text-body text-fg-subtle sm:px-6">No identifiers recorded.</p>
              )}
            </Panel>
          </StaggerItem>

          <StaggerItem>
            <Panel headingId="classification-heading" eyebrow="Classification" title="Tags and technologies">
              <div className="grid gap-6 px-5 py-5 sm:grid-cols-2 sm:px-6">
                <div>
                  <p className="eyebrow mb-2.5 text-fg-subtle">Tags</p>
                  {asset.tags.length ? <TagList tags={asset.tags} /> : <p className="text-caption text-fg-subtle">None</p>}
                </div>
                <div>
                  <p className="eyebrow mb-2.5 text-fg-subtle">Technologies</p>
                  {asset.technologies.length ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Technologies">
                      {asset.technologies.map((tech) => (
                        <li key={tech} className="rounded-sm bg-surface-raised px-2 py-0.5 text-caption text-fg-muted ring-1 ring-inset ring-line">
                          {tech}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-caption text-fg-subtle">None</p>
                  )}
                  <p className="mt-3 text-caption text-fg-subtle">Labels only. Versioned software inventory arrives in a later phase.</p>
                </div>
              </div>
            </Panel>
          </StaggerItem>
        </div>

        <div className="min-w-0 space-y-6">
          <StaggerItem>
            <Panel headingId="ownership-heading" eyebrow="Accountability" title="Ownership">
              <Facts
                rows={[
                  ['Team', asset.owner.team || '—'],
                  ['Contact', asset.owner.contact ? asset.owner.contact.fullName : asset.owner.contactRemoved ? 'No longer a member' : '—'],
                ]}
              />
            </Panel>
          </StaggerItem>
          <StaggerItem>
            <Panel headingId="record-heading" eyebrow="Record" title="Provenance">
              <Facts
                rows={[
                  ['Source', asset.discovery.sourceLabel],
                  ['First recorded', when(asset.discovery.firstSeenAt) ?? '—'],
                  ['Last observed', when(asset.discovery.lastSeenAt) ?? 'Not observed by a scanner yet'],
                  ['Created', `${when(asset.createdAt)}${asset.createdBy ? ` · ${asset.createdBy.fullName}` : ''}`],
                  ['Updated', `${when(asset.updatedAt)}${asset.updatedBy ? ` · ${asset.updatedBy.fullName}` : ''}`],
                  ['Revision', String(asset.revision)],
                  ['Asset ID', <span key="id" className="font-mono text-caption">{asset.id}</span>],
                ]}
              />
            </Panel>
          </StaggerItem>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {busy ? `${busy === 'delete' ? 'Deleting' : busy === 'archive' ? 'Archiving' : 'Restoring'} asset` : flashCopy ? flashCopy[0] : ''}
      </p>

      {confirming === 'archive' && (
        <Dialog
          title={`Archive ${asset.name}?`}
          description="It leaves the live inventory and becomes read-only. Its identifiers become available to other assets. You can restore it later."
          initialFocusRef={cancelRef}
          onClose={() => busy !== 'archive' && setConfirming(null)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} variant="secondary" size="md" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button size="md" loading={busy === 'archive'} loadingLabel="Archiving…" onClick={archive}>
              Archive asset
            </Button>
          </div>
        </Dialog>
      )}

      {confirming === 'delete' && (
        <Dialog
          tone="danger"
          title="Delete this asset permanently?"
          description={
            <>
              This removes <span className="text-fg">{asset.name}</span> and can't be undone. The audit trail keeps a
              record that it existed. Type the asset name to confirm.
            </>
          }
          initialFocusRef={cancelRef}
          onClose={() => {
            if (busy === 'delete') return
            setConfirming(null)
            setConfirmName('')
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (confirmName === asset.name) remove()
            }}
          >
            <TextField
              id="confirm-asset-name"
              label="Asset name"
              autoComplete="off"
              spellCheck={false}
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
            />
            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                ref={cancelRef}
                variant="secondary"
                size="md"
                onClick={() => {
                  setConfirming(null)
                  setConfirmName('')
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" size="md" disabled={confirmName !== asset.name} loading={busy === 'delete'} loadingLabel="Deleting…">
                Delete permanently
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </Stagger>
  )
}

function Facts({ rows }) {
  return (
    <dl className="divide-y divide-line-subtle border-t border-line-subtle">
      {rows.map(([term, value]) => (
        <div key={term} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3 sm:px-6">
          <dt className="eyebrow text-fg-subtle">{term}</dt>
          <dd className="min-w-0 break-words text-right text-label text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function IdentifierRow({ identifier }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(identifier.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable: the value is selectable text */
    }
  }
  return (
    <li className="flex items-center gap-3 px-5 py-3 sm:px-6">
      <span className="eyebrow w-28 shrink-0 text-fg-subtle">{identifier.kindLabel}</span>
      {/* Rendered as text, never as a link: identifiers are recorded data, not navigation. */}
      <code className="min-w-0 flex-1 break-all font-mono text-caption text-fg">{identifier.value}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `Copied ${identifier.kindLabel}` : `Copy ${identifier.kindLabel}`}
        className="grid size-11 shrink-0 place-items-center rounded-sm text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-ion"
      >
        {copied ? <Check aria-hidden="true" size={15} className="text-success" /> : <Copy aria-hidden="true" size={15} />}
      </button>
    </li>
  )
}
