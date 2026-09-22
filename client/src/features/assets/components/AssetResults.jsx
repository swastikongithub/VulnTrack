import { ChevronLeft, ChevronRight, Globe } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/design-system/components'
import { cn } from '@/lib/cn'
import { ArchivedChip, AssetTypeIcon, CriticalityMeter, ExposureChip, LifecycleChip } from './AssetSignals'

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

function updatedText(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'just now'
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(diff / 3600), 'hour')
  if (abs < 86_400 * 14) return relative.format(Math.round(diff / 86_400), 'day')
  return dateFormat.format(new Date(iso))
}

const primaryIdentifier = (asset) => asset.identifiers[0]?.value

/**
 * Inventory results: a semantic table from 768px, stacked cards below.
 * Each row's name is the link (its hit area stretches across the row), so
 * keyboard and screen-reader users get one stop per asset.
 */
export function AssetResults({ assets, busy, caption }) {
  return (
    <div aria-busy={busy || undefined} className={cn('transition-opacity duration-[var(--duration-base)]', busy && 'opacity-60')}>
      <table className="hidden w-full table-fixed border-collapse md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line-subtle">
            {[
              ['Asset', 'pl-6'],
              ['Criticality', 'w-28'],
              ['Environment', 'w-28'],
              ['Exposure', 'w-32 max-xl:hidden'],
              ['Lifecycle', 'w-28'],
              ['Updated', 'w-28 pr-6 text-right'],
            ].map(([label, cls]) => (
              <th key={label} scope="col" className={cn('eyebrow py-2.5 text-left font-normal text-fg-subtle', cls)}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {assets.map((asset) => (
            <tr key={asset.id} className="group relative transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover/60">
              <td className="py-3.5 pl-6 pr-4">
                <div className="flex min-w-0 items-center gap-3">
                  <AssetTypeIcon type={asset.type} />
                  <div className="min-w-0">
                    <Link
                      to={`/organization/assets/${asset.id}`}
                      className="block truncate text-label text-fg after:absolute after:inset-0 group-hover:text-ion focus-visible:outline-none focus-visible:after:rounded-md focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ion"
                    >
                      {asset.name}
                    </Link>
                    <p className="truncate text-caption text-fg-subtle">
                      {asset.typeLabel}
                      {primaryIdentifier(asset) && <span className="font-mono"> · {primaryIdentifier(asset)}</span>}
                    </p>
                  </div>
                </div>
              </td>
              <td className="pr-4">
                <CriticalityMeter criticality={asset.criticality} label={asset.criticalityLabel} compact />
              </td>
              <td className="truncate pr-4 text-caption text-fg-muted">{asset.environmentLabel}</td>
              <td className="pr-4 max-xl:hidden">
                <span className={cn('inline-flex items-center gap-1.5 text-caption', asset.exposure === 'internet_facing' ? 'text-ion' : 'text-fg-muted')}>
                  {asset.exposure === 'internet_facing' && <Globe aria-hidden="true" size={13} />}
                  {asset.exposureLabel}
                </span>
              </td>
              <td className="pr-4">{asset.archived ? <ArchivedChip /> : <LifecycleChip status={asset.status} label={asset.statusLabel} />}</td>
              <td className="pr-6 text-right text-caption tabular text-fg-subtle">
                <time dateTime={asset.updatedAt} title={new Date(asset.updatedAt).toLocaleString()}>
                  {updatedText(asset.updatedAt)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line-subtle md:hidden" aria-label={caption}>
        {assets.map((asset) => (
          <li key={asset.id} className="relative px-4 py-4 transition-colors hover:bg-surface-hover/60">
            <div className="flex items-start gap-3">
              <AssetTypeIcon type={asset.type} />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/organization/assets/${asset.id}`}
                  className="block truncate text-label text-fg after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ion"
                >
                  {asset.name}
                </Link>
                <p className="truncate text-caption text-fg-subtle">
                  {asset.typeLabel} · {asset.environmentLabel}
                </p>
                {primaryIdentifier(asset) && <p className="mt-0.5 truncate font-mono text-caption text-fg-subtle">{primaryIdentifier(asset)}</p>}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <CriticalityMeter criticality={asset.criticality} label={asset.criticalityLabel} compact />
                  {asset.archived ? <ArchivedChip /> : <LifecycleChip status={asset.status} label={asset.statusLabel} />}
                  {asset.exposure === 'internet_facing' && <ExposureChip exposure={asset.exposure} label={asset.exposureLabel} />}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Pagination({ page, totalPages, total, pageSize, onPage, busy, noun = ['asset', 'assets'] }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 sm:px-6">
      <p className="text-caption tabular text-fg-subtle" aria-live="polite">
        {from}–{to} of {total} {total === 1 ? noun[0] : noun[1]}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            disabled={page <= 1 || busy}
            onClick={() => onPage(page - 1)}
            leadingIcon={<ChevronLeft aria-hidden="true" size={16} />}
          >
            Previous
          </Button>
          <span className="px-1 text-caption tabular text-fg-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="md"
            disabled={page >= totalPages || busy}
            onClick={() => onPage(page + 1)}
            trailingIcon={<ChevronRight aria-hidden="true" size={16} />}
          >
            Next
          </Button>
        </div>
      )}
    </nav>
  )
}
