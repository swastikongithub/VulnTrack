import { AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Button } from '@/design-system/components'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Pagination } from '@/features/assets/components/AssetResults'
import { Panel, SkeletonRows } from '@/features/organization/components/PagePrimitives'
import { useApiResource } from '@/features/organization/hooks/useApiResource'
import { listComponents } from '@/services/software/softwareApi'
import { describeSoftwareError } from '@/services/software/softwareErrors'
import { SOFTWARE_LIMITS } from '../softwareCatalog'
import { ComponentEditorDialog, RemoveComponentDialog } from './ComponentDialogs'
import { SoftwareResults } from './SoftwareResults'
import { SearchBox } from './SoftwareToolbar'

/**
 * The asset's software components, on the asset detail page. Add / edit /
 * remove follow the asset's own `update` capability (false when archived).
 */
export function AssetSoftwarePanel({ asset }) {
  const organizationId = useSessionStore((s) => s.session?.organization?.id)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [flash, setFlash] = useState(null)
  const canEdit = asset.actions.update

  const results = useApiResource(
    () => listComponents({ assetId: asset.id, q, page, pageSize: SOFTWARE_LIMITS.assetPageSize }),
    `${organizationId}:asset-software:${asset.id}:${asset.archived}:${q}:${page}`,
  )
  const [lastResults, setLastResults] = useState(null)
  if (results.data && results.data !== lastResults) setLastResults(results.data)
  const shown = results.data ?? (results.status === 'loading' ? lastResults : null)
  const search = useCallback((value) => {
    setQ(value)
    setPage(1)
  }, [])

  const description = shown
    ? q
      ? `${shown.total} matching ${shown.total === 1 ? 'component' : 'components'}`
      : `${shown.total} ${shown.total === 1 ? 'component' : 'components'} recorded`
    : 'Loading software'

  return (
    <Panel
      headingId="software-heading"
      eyebrow="Supply chain"
      title="Software"
      description={description}
      actions={
        canEdit && (
          <Button size="md" variant="secondary" leadingIcon={<Plus aria-hidden="true" size={15} />} onClick={() => setEditor({})}>
            Add component
          </Button>
        )
      }
    >
      <AnimatePresence initial={false}>
        {flash && (
          <div key={flash.key} className="px-5 pt-4 sm:px-6">
            <Alert tone="success" title={flash.title}>
              {flash.body}
            </Alert>
          </div>
        )}
      </AnimatePresence>

      {(q || (shown && shown.total > 8)) && (
        <div className="px-5 pt-4 sm:px-6">
          <SearchBox value={q} onChange={search} label={`Search ${asset.name}'s software`} placeholder="Search this asset's software…" />
        </div>
      )}

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

      {!shown && results.status === 'loading' && <SkeletonRows rows={3} label="Loading software" />}

      {shown && shown.total === 0 && (
        <div className="px-5 py-6 sm:px-6">
          {q ? (
            <p className="text-body text-fg-muted">No components match “{q}”.</p>
          ) : (
            <>
              <p className="text-label text-fg">No software recorded</p>
              <p className="mt-1 max-w-prose text-body text-fg-muted">
                List the packages and products this asset runs, with exact versions where you know them.
                {!canEdit && !asset.archived && ' Security analysts, admins and owners can add them.'}
              </p>
            </>
          )}
        </div>
      )}

      {shown && shown.components.length > 0 && (
        <div className="mt-2">
          <SoftwareResults
            components={shown.components}
            showAsset={false}
            busy={results.status === 'loading'}
            caption={`Software on ${asset.name}`}
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
            onPage={(next) => {
              setPage(next)
              document.getElementById('software-heading')?.focus()
            }}
          />
        </div>
      )}

      {editor && (
        <ComponentEditorDialog
          component={editor.component}
          asset={{ id: asset.id, name: asset.name }}
          onClose={() => setEditor(null)}
          onStale={() => results.reload({ quiet: true })}
          onSaved={(saved) => {
            const added = !editor.component
            setEditor(null)
            setFlash({
              key: `${saved.id}:${saved.revision}`,
              title: added ? 'Component added' : 'Changes saved',
              body: `${saved.name}${saved.version ? ` ${saved.version}` : ' (version unknown)'}.`,
            })
            results.reload({ quiet: true })
          }}
        />
      )}

      {removing && (
        <RemoveComponentDialog
          component={removing}
          onClose={() => setRemoving(null)}
          onStale={() => results.reload({ quiet: true })}
          onRemoved={(removed) => {
            setRemoving(null)
            setFlash({ key: `removed:${removed.id}`, title: 'Component removed', body: `${removed.name} is no longer listed.` })
            results.mutate((data) => data && { ...data, components: data.components.filter((c) => c.id !== removed.id), total: data.total - 1 })
            requestAnimationFrame(() => document.getElementById('software-heading')?.focus())
            results.reload({ quiet: true })
          }}
        />
      )}
    </Panel>
  )
}
