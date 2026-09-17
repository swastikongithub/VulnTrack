import { AnimatePresence } from 'framer-motion'
import { Plus, SearchX } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Alert, Button } from '@/design-system/components'
import { useSessionStore } from '@/features/auth/sessionStore'
import { PageHeader, Panel, Readouts, SkeletonRows, Stagger, StaggerItem } from '@/features/organization/components/PagePrimitives'
import { PerimeterMotif } from '@/features/organization/components/PerimeterMotif'
import { useApiResource } from '@/features/organization/hooks/useApiResource'
import { can, useOrganization } from '@/features/organization/organizationContext'
import { getAssetSummary, listAssets } from '@/services/assets/assetApi'
import { describeAssetError } from '@/services/assets/assetErrors'
import { ASSET_LIMITS, ASSET_SORTS, labelOf } from '../assetCatalog'
import { AssetResults, Pagination } from '../components/AssetResults'
import { InventoryToolbar } from '../components/InventoryToolbar'
import { activeFilterCount, nextInventoryParams, readInventoryQuery } from '../inventoryQuery'
import { useClearFlashOnce } from '../useFlash'

/**
 * Asset inventory: the organization's attack surface as a searchable,
 * filterable, server-paginated list. All view state is in the URL.
 */
export function AssetInventoryPage() {
  const { details } = useOrganization()
  const organizationId = useSessionStore((s) => s.session?.organization?.id)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = readInventoryQuery(searchParams)
  const queryKey = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString()
  const [flash] = useState(location.state?.flash ?? null)
  useClearFlashOnce(location, navigate)

  const summary = useApiResource(getAssetSummary, `${organizationId}:summary`)
  const results = useApiResource(
    () => listAssets({ ...query, page: query.page || 1, pageSize: ASSET_LIMITS.pageSize }),
    `${organizationId}:assets:${queryKey}`,
  )
  // Keep showing the previous page while the next one loads (dimmed), instead of flashing skeletons.
  const [lastResults, setLastResults] = useState(null)
  if (results.data && results.data !== lastResults) setLastResults(results.data)
  const shown = results.data ?? (results.status === 'loading' ? lastResults : null)

  const update = useCallback(
    (changes) => setSearchParams(nextInventoryParams(readInventoryQuery(searchParams), changes), { replace: !('page' in changes) }),
    [searchParams, setSearchParams],
  )

  const canCreate = can(details, 'assets:create')
  const archivedView = query.archived === 'true'
  const filtered = Boolean(query.q) || activeFilterCount(query) > 0
  const counts = summary.data
  const sortLabel = labelOf(ASSET_SORTS, query.sort || 'name')

  return (
    <Stagger>
      <PageHeader
        eyebrow={`${details?.organization.name ?? 'Organization'} · Attack surface`}
        title="Assets"
        aside={
          canCreate && (
            <Button size="md" leadingIcon={<Plus aria-hidden="true" size={16} />} onClick={() => navigate('/organization/assets/new')}>
              New asset
            </Button>
          )
        }
      >
        Everything this organization needs to protect. Criticality, environment and exposure recorded here will drive how
        findings are prioritized later.
      </PageHeader>

      <AnimatePresence initial={false}>
        {flash?.type === 'deleted' && (
          <Alert key="deleted" tone="success" title="Asset deleted" className="mb-6">
            {flash.name} was permanently removed from the inventory.
          </Alert>
        )}
      </AnimatePresence>

      <StaggerItem className="mb-6">
        <Readouts
          items={[
            { label: 'Live assets', value: counts ? counts.total : '—' },
            { label: 'Critical', value: counts ? counts.byCriticality.critical : '—' },
            { label: 'Internet-facing', value: counts ? counts.internetFacing : '—' },
            { label: 'Archived', value: counts ? counts.archived : '—' },
          ]}
        />
      </StaggerItem>

      <StaggerItem className="mb-4">
        <InventoryToolbar query={query} onChange={update} tags={counts?.tags} counts={counts} />
      </StaggerItem>

      <StaggerItem>
        <Panel
          headingId="inventory-heading"
          eyebrow={archivedView ? 'Archived' : 'Inventory'}
          title={archivedView ? 'Archived assets' : 'Live assets'}
          description={
            shown ? `${shown.total} ${shown.total === 1 ? 'result' : 'results'} · sorted by ${sortLabel.toLowerCase()}` : 'Loading inventory'
          }
          actions={
            filtered && (
              <Button variant="ghost" size="md" onClick={() => setSearchParams(archivedView ? { archived: 'true' } : {})}>
                Clear filters
              </Button>
            )
          }
        >
          {results.status === 'error' && !shown && (
            <div className="p-5 sm:p-6">
              <Alert
                tone="danger"
                title={describeAssetError(results.error, 'load assets').title}
                action={
                  <Button variant="secondary" size="md" onClick={() => results.reload()}>
                    Try again
                  </Button>
                }
              >
                {describeAssetError(results.error, 'load assets').body}
              </Alert>
            </div>
          )}

          {!shown && results.status === 'loading' && <SkeletonRows rows={5} label="Loading assets" />}

          {shown && shown.total === 0 && (
            <EmptyInventory
              filtered={filtered}
              archivedView={archivedView}
              canCreate={canCreate}
              onClear={() => setSearchParams(archivedView ? { archived: 'true' } : {})}
              onCreate={() => navigate('/organization/assets/new')}
            />
          )}

          {shown && shown.total > 0 && shown.assets.length === 0 && (
            <div className="p-6 text-body text-fg-muted">
              This page is past the end of the results.{' '}
              <Button variant="ghost" size="md" onClick={() => update({ page: '' })}>
                Go to the first page
              </Button>
            </div>
          )}

          {shown && shown.assets.length > 0 && (
            <>
              <AssetResults
                assets={shown.assets}
                busy={results.status === 'loading'}
                caption={`${archivedView ? 'Archived assets' : 'Assets'}, sorted by ${sortLabel.toLowerCase()}, page ${shown.page} of ${shown.totalPages}`}
              />
              <Pagination
                page={shown.page}
                totalPages={shown.totalPages}
                total={shown.total}
                pageSize={shown.pageSize}
                busy={results.status === 'loading'}
                onPage={(page) => {
                  update({ page: page > 1 ? String(page) : '' })
                  document.getElementById('inventory-heading')?.focus({ preventScroll: false })
                }}
              />
            </>
          )}
        </Panel>
      </StaggerItem>
      <p className="sr-only" role="status" aria-live="polite">
        {results.status === 'loading' ? 'Loading assets' : shown ? `${shown.total} assets found` : ''}
      </p>
    </Stagger>
  )
}

function EmptyInventory({ filtered, archivedView, canCreate, onClear, onCreate }) {
  if (filtered) {
    return (
      <div className="flex flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:px-6">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-raised text-fg-subtle ring-1 ring-inset ring-line">
          <SearchX size={20} strokeWidth={1.75} />
        </span>
        <div className="flex-1">
          <p className="text-label text-fg">No assets match these filters</p>
          <p className="mt-1 text-body text-fg-muted">Try a broader search or clear the filters.</p>
        </div>
        <Button variant="secondary" size="md" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    )
  }
  if (archivedView) {
    return <p className="px-5 py-10 text-body text-fg-muted sm:px-6">No archived assets. Archived assets appear here and can be restored.</p>
  }
  return (
    <div className="relative overflow-hidden px-5 py-12 sm:px-10">
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/2 w-[26rem] -translate-y-1/2 opacity-60 max-sm:hidden">
        <PerimeterMotif className="w-full" />
      </span>
      <div className="relative max-w-md">
        <p className="eyebrow mb-3 flex items-center gap-2.5 text-ion">
          <span aria-hidden="true" className="h-px w-5 bg-current opacity-70" />
          Empty inventory
        </p>
        <h3 className="text-title-2 text-fg">Map your attack surface</h3>
        <p className="mt-2 text-body text-fg-muted">
          Start with the systems you'd least like to see breached: public APIs, customer-facing apps, databases with
          sensitive data.
        </p>
        {canCreate ? (
          <Button className="mt-6" leadingIcon={<Plus aria-hidden="true" size={16} />} onClick={onCreate}>
            Add the first asset
          </Button>
        ) : (
          <p className="mt-6 text-caption text-fg-subtle">Security analysts, admins and owners can add assets.</p>
        )}
      </div>
    </div>
  )
}
