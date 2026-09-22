import { Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { IconButton } from '@/design-system/components'
import { cn } from '@/lib/cn'
import { ArchivedChip } from '@/features/assets/components/AssetSignals'
import { usageText } from '../softwareCatalog'
import { EcosystemBadge, VersionText } from './SoftwareSignals'

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** The parent asset's name as a link. Vertical padding (offset by negative margin) gives it a 44px hit area without changing the layout. */
function AssetLink({ asset }) {
  if (!asset) return <span className="text-caption text-fg-subtle">—</span>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link
        to={`/organization/assets/${asset.id}`}
        className="-my-3.5 block min-w-0 truncate py-3.5 text-label text-fg-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ion hover:decoration-ion/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion"
      >
        {asset.name}
      </Link>
      {asset.archived && <ArchivedChip />}
    </span>
  )
}

function RowActions({ component, onEdit, onRemove }) {
  if (!component.actions.update && !component.actions.delete) return null
  const label = `${component.name}${component.version ? ` ${component.version}` : ''}`
  return (
    <span className="flex justify-end">
      {component.actions.update && (
        <IconButton label={`Edit ${label}`} onClick={() => onEdit(component)}>
          <Pencil size={15} />
        </IconButton>
      )}
      {component.actions.delete && (
        <IconButton label={`Remove ${label}`} className="hover:text-danger" onClick={() => onRemove(component)}>
          <Trash2 size={15} />
        </IconButton>
      )}
    </span>
  )
}

/**
 * Software components: a semantic table from 768px, stacked cards below.
 * `showAsset` adds the parent-asset column (organization-wide list).
 * Usage and Updated appear by the table's own width (container queries), not
 * the viewport's, because the same table sits in the full-width inventory and
 * in the narrower asset-page column.
 */
export function SoftwareResults({ components, showAsset = true, busy, caption, onEdit, onRemove }) {
  const anyActions = components.some((c) => c.actions.update || c.actions.delete)
  return (
    <div aria-busy={busy || undefined} className={cn('@container transition-opacity duration-[var(--duration-base)]', busy && 'opacity-60')}>
      <table className="hidden w-full table-fixed border-collapse md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line-subtle">
            {[
              ['Package', 'pl-6'],
              ['Version', 'w-32'],
              showAsset && ['Asset', 'w-[22%]'],
              ['Usage', 'w-36 @max-2xl:hidden'],
              ['Updated', 'w-28 @max-4xl:hidden'],
              anyActions && [<span key="a" className="sr-only">Actions</span>, 'w-24 pr-4'],
            ]
              .filter(Boolean)
              .map(([label, cls], i) => (
                <th key={i} scope="col" className={cn('eyebrow py-2.5 pr-4 text-left font-normal text-fg-subtle', cls)}>
                  {label}
                </th>
              ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {components.map((component) => (
            <tr key={component.id} className="transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover/60">
              <td className="py-3 pl-6 pr-4">
                <div className="flex min-w-0 items-center gap-3">
                  <EcosystemBadge ecosystem={component.ecosystem} />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-label text-fg">
                      {component.vendor && <span className="text-fg-subtle">{component.vendor} / </span>}
                      {component.name}
                    </p>
                    <p className="truncate font-mono text-eyebrow text-fg-subtle" title={component.purl}>
                      <span className="sr-only">{component.ecosystemLabel}, package URL </span>
                      {component.purl}
                    </p>
                  </div>
                </div>
              </td>
              <td className="pr-4">
                <VersionText version={component.version} />
              </td>
              {showAsset && (
                <td className="pr-4">
                  <AssetLink asset={component.asset} />
                </td>
              )}
              <td className="truncate pr-4 text-caption text-fg-muted @max-2xl:hidden">{usageText(component)}</td>
              <td className="pr-4 text-caption tabular text-fg-subtle @max-4xl:hidden">
                <time dateTime={component.updatedAt}>{dateFormat.format(new Date(component.updatedAt))}</time>
              </td>
              {anyActions && (
                <td className="pr-4">
                  <RowActions component={component} onEdit={onEdit} onRemove={onRemove} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line-subtle md:hidden" aria-label={caption}>
        {components.map((component) => (
          <li key={component.id} className="flex items-start gap-3 px-4 py-4">
            <EcosystemBadge ecosystem={component.ecosystem} />
            <div className="min-w-0 flex-1">
              <p className="break-all font-mono text-label text-fg">
                {component.vendor && <span className="text-fg-subtle">{component.vendor} / </span>}
                {component.name}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
                <span>{component.ecosystemLabel}</span>
                <span aria-hidden="true">·</span>
                <VersionText version={component.version} />
              </p>
              {showAsset && (
                <div className="mt-1.5">
                  <AssetLink asset={component.asset} />
                </div>
              )}
              <p className="mt-1 text-caption text-fg-subtle">{usageText(component)}</p>
            </div>
            <div className="-mr-2 -mt-2 shrink-0">
              <RowActions component={component} onEdit={onEdit} onRemove={onRemove} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
