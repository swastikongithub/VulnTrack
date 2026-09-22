import { AnimatePresence } from 'framer-motion'
import { Layers, Plus, SearchX } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Button } from '@/design-system/components'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Pagination } from '@/features/assets/components/AssetResults'
import { PageHeader, Panel, Readouts, SkeletonRows, Stagger, StaggerItem } from '@/features/organization/components/PagePrimitives'
import { useApiResource } from '@/features/organization/hooks/useApiResource'
import { can, useOrganization } from '@/features/organization/organizationContext'
import { getSoftwareSummary, listComponents } from '@/services/software/softwareApi'
import { describeSoftwareError } from '@/services/software/softwareErrors'
import { ComponentEditorDialog, RemoveComponentDialog } from '../components/ComponentDialogs'
import { SoftwareResults } from '../components/SoftwareResults'
import { EcosystemBadge } from '../components/SoftwareSignals'
import { SoftwareToolbar } from '../components/SoftwareToolbar'
import { labelOf, SOFTWARE_LIMITS, SOFTWARE_SORTS } from '../softwareCatalog'
import { activeFilterCount, nextSoftwareParams, readSoftwareQuery } from '../softwareQuery'

/**
 * Organization-wide software inventory: every component recorded on a live
 * asset, searchable and filterable, with the packages used most widely.
 * View state is in the URL.
 */
export function SoftwareInventoryPage() {
  const { details } = useOrganization()
  const organizationId = useSessionStore((s) => s.session?.organization?.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const query = readSoftwareQuery(searchParams)
  const queryKey = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString()
  const [editor, setEditor] = useState(null) // { component? }
  const [removing, setRemoving] = useState(null)
  const [flash, setFlash] = useState(null)

  const summary = useApiResource(getSoftwareSummary, `${organizationId}:software-summary`)
  const results = useApiResource(
    () => listComponents({ ...query, page: query.page || 1, pageSize: SOFTWARE_LIMITS.pageSize }),
    `${organizationId}:software:${queryKey}`,
  )
  // Keep the previous page visible (dimmed) while the next one loads.
  const [lastResults, setLastResults] = useState(null)
  if (results.data && results.data !== lastResults) setLastResults(results.data)
  const shown = results.data ?? (results.status === 'loading' ? lastResults : null)

  const update = useCallback(
    (changes) => setSearchParams(nextSoftwareParams(readSoftwareQuery(searchParams), changes), { replace: !('page' in changes) }),
    [searchParams, setSearchParams],
  )

  const refresh = () => {
    results.reload({ quiet: true })
    summary.reload({ quiet: true })
  }

  const canEdit = can(details, 'assets:update')
  const filtered = Boolean(query.q) || activeFilterCount(query) > 0
  const counts = summary.data
  const sortLabel = labelOf(SOFTWARE_SORTS, query.sort || 'name')

  return (
    <Stagger>
      <PageHeader
        eyebrow={`${details?.organization.name ?? 'Organization'} · Supply chain`}
        title="Software"
        aside={
          canEdit && (
            <Button size="md" leadingIcon={<Plus aria-hidden="true" size={16} />} onClick={() => setEditor({})}>
              Add component
            </Button>
          )
        }
      >
        The packages and products your assets run, with their versions. Recorded here with canonical identities so they can be
        checked against vulnerability data in a later phase.
      </PageHeader>

      <AnimatePresence initial={false}>
        {flash && (
          <Alert key={flash.key} tone="success" title={flash.title} className="mb-6">
            {flash.body}
          </Alert>
        )}
      </AnimatePresence>

      <StaggerItem className="mb-6">
        <Readouts
          items={[
            { label: 'Components', value: counts ? counts.total : '—' },
            { label: 'Packages', value: counts ? counts.packages : '—' },
            { label: 'Assets covered', value: counts ? counts.assets : '—' },
            { label: 'Unknown versions', value: counts ? counts.unknownVersions : '—' },
          ]}
        />
      </StaggerItem>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <StaggerItem>
            <SoftwareToolbar query={query} onChange={update} />
          </StaggerItem>

          <StaggerItem>
            <Panel
              headingId="software-heading"
              eyebrow="Inventory"
              title="Components on live assets"
              description={
                shown ? `${shown.total} ${shown.total === 1 ? 'result' : 'results'} · sorted by ${sortLabel.toLowerCase()}` : 'Loading software'
              }
              actions={
                filtered && (
                  <Button variant="ghost" size="md" onClick={() => setSearchParams({})}>
                    Clear filters
                  </Button>
                )
              }
            >
              {results.status === 'error' && !shown && (
                <div className="p-5 sm:p-6">
                  <Alert
                    tone="danger"
                    title={describeSoftwareError(results.error, 'load software').title}
                    action={
                      <Button variant="secondary" size="md" onClick={() => results.reload()}>
                        Try again
                      </Button>
                    }
                  >
                    {describeSoftwareError(results.error, 'load software').body}
                  </Alert>
                </div>
              )}

              {!shown && results.status === 'loading' && <SkeletonRows rows={5} label="Loading software" />}

              {shown && shown.total === 0 && (
                <EmptySoftware filtered={filtered} canEdit={canEdit} onClear={() => setSearchParams({})} onAdd={() => setEditor({})} />
              )}

              {shown && shown.total > 0 && shown.components.length === 0 && (
                <div className="p-6 text-body text-fg-muted">
                  This page is past the end of the results.{' '}
                  <Button variant="ghost" size="md" onClick={() => update({ page: '' })}>
                    Go to the first page
                  </Button>
                </div>
              )}

              {shown && shown.components.length > 0 && (
                <>
                  <SoftwareResults
                    components={shown.components}
                    busy={results.status === 'loading'}
                    caption={`Software components, sorted by ${sortLabel.toLowerCase()}, page ${shown.page} of ${shown.totalPages}`}
                    onEdit={(component) => setEditor({ component })}
                    onRemove={setRemoving}
                  />
                  <Pagination
                    page={shown.page}
                    totalPages={shown.totalPages}
                    total={shown.total}
                    pageSize={shown.pageSize}
                    busy={results.status === 'loading'}
                    noun={['component', 'components']}
                    onPage={(page) => {
                      update({ page: page > 1 ? String(page) : '' })
                      document.getElementById('software-heading')?.focus({ preventScroll: false })
                    }}
                  />
                </>
              )}
            </Panel>
          </StaggerItem>
        </div>

        <StaggerItem>
          <TopPackages summary={counts} onPick={(name) => update({ q: name })} />
        </StaggerItem>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {results.status === 'loading' ? 'Loading software' : shown ? `${shown.total} components found` : ''}
      </p>

      {editor && (
        <ComponentEditorDialog
          component={editor.component}
          onClose={() => setEditor(null)}
          onStale={refresh}
          onSaved={(saved) => {
            const added = !editor.component
            setEditor(null)
            setFlash({
              key: `${saved.id}:${saved.revision}`,
              title: added ? 'Component added' : 'Changes saved',
              body: `${saved.name}${saved.version ? ` ${saved.version}` : ''} on ${saved.asset?.name ?? 'the asset'}.`,
            })
            refresh()
          }}
        />
      )}

      {removing && (
        <RemoveComponentDialog
          component={removing}
          onClose={() => setRemoving(null)}
          onStale={refresh}
          onRemoved={(removed) => {
            setRemoving(null)
            setFlash({ key: `removed:${removed.id}`, title: 'Component removed', body: `${removed.name} is no longer listed for ${removed.asset?.name ?? 'the asset'}.` })
            // Drop the row now (its buttons held focus), then give focus a stable home.
            results.mutate((data) => data && { ...data, components: data.components.filter((c) => c.id !== removed.id), total: data.total - 1 })
            requestAnimationFrame(() => document.getElementById('software-heading')?.focus())
            refresh()
          }}
        />
      )}
    </Stagger>
  )
}

/** Packages recorded on the most assets, with how many versions are in use. Selecting one searches for it. */
function TopPackages({ summary, onPick }) {
  const packages = summary?.topPackages ?? []
  return (
    <Panel
      headingId="packages-heading"
      eyebrow="Spread"
      title="Most used packages"
      description={summary ? `${summary.multiVersionPackages} ${summary.multiVersionPackages === 1 ? 'package runs' : 'packages run'} in more than one version` : undefined}
    >
      {!summary && <SkeletonRows rows={3} label="Loading packages" />}
      {summary && packages.length === 0 && <p className="px-5 py-5 text-body text-fg-subtle sm:px-6">Nothing recorded yet.</p>}
      {packages.length > 0 && (
        <ul className="divide-y divide-line-subtle">
          {packages.map((pkg) => (
            <li key={pkg.packageKey}>
              <button
                type="button"
                onClick={() => onPick(pkg.name)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ion sm:px-6"
              >
                <EcosystemBadge ecosystem={pkg.ecosystem} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-label text-fg">{pkg.name}</span>
                  <span className="block text-caption text-fg-subtle">
                    {pkg.ecosystemLabel} · {pkg.assets} {pkg.assets === 1 ? 'asset' : 'assets'}
                  </span>
                </span>
                <span className={pkg.versions > 1 ? 'text-caption text-warning' : 'text-caption text-fg-subtle'}>
                  {pkg.versions} {pkg.versions === 1 ? 'version' : 'versions'}
                </span>
                <span className="sr-only">. Show these components.</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function EmptySoftware({ filtered, canEdit, onClear, onAdd }) {
  if (filtered) {
    return (
      <div className="flex flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:px-6">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-raised text-fg-subtle ring-1 ring-inset ring-line">
          <SearchX size={20} strokeWidth={1.75} />
        </span>
        <div className="flex-1">
          <p className="text-label text-fg">No components match these filters</p>
          <p className="mt-1 text-body text-fg-muted">Try a broader search or clear the filters.</p>
        </div>
        <Button variant="secondary" size="md" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    )
  }
  return (
    <div className="px-5 py-12 sm:px-10">
      <div className="max-w-md">
        <p className="eyebrow mb-3 flex items-center gap-2.5 text-ion">
          <Layers aria-hidden="true" size={14} />
          No software recorded
        </p>
        <h3 className="text-title-2 text-fg">List what your assets run</h3>
        <p className="mt-2 text-body text-fg-muted">
          Start with the frameworks and libraries of your most critical, internet-facing assets. Exact versions matter: they’re
          what vulnerability advisories are written against.
        </p>
        {canEdit ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button leadingIcon={<Plus aria-hidden="true" size={16} />} onClick={onAdd}>
              Add the first component
            </Button>
            <Link to="/organization/assets" className="text-label text-fg-muted underline underline-offset-4 hover:text-fg">
              Or open an asset
            </Link>
          </div>
        ) : (
          <p className="mt-6 text-caption text-fg-subtle">Security analysts, admins and owners can record software.</p>
        )}
      </div>
    </div>
  )
}
