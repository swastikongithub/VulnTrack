import { AlertTriangle, CheckCircle2, CircleDashed, Loader2 } from 'lucide-react'
import { Panel, SkeletonRows } from '@/features/organization/components/PagePrimitives'
import { cn } from '@/lib/cn'
import { formatDate, timeAgo } from '../vulnerabilityFormat'
import { SourceTag } from './VulnerabilitySignals'

const RUN_STATES = {
  succeeded: { label: 'Last sync succeeded', icon: CheckCircle2, className: 'text-success' },
  partial: { label: 'Last sync finished with skipped records', icon: AlertTriangle, className: 'text-warning' },
  failed: { label: 'Last sync failed', icon: AlertTriangle, className: 'text-danger' },
  running: { label: 'Sync in progress', icon: Loader2, className: 'text-ion' },
}

/**
 * How current each public source is, from the ingestion run log. Stated
 * plainly ("synced 3 hours ago") rather than implied: the catalogue is a copy,
 * refreshed by the ingestion worker, not a live feed.
 */
export function SourceFreshness({ summary }) {
  return (
    <Panel headingId="sources-heading" eyebrow="Provenance" title="Sources" description="Public advisory data, copied into VulnTrack by the ingestion worker.">
      {!summary && <SkeletonRows rows={2} label="Loading sources" />}
      {summary && (
        <ul className="divide-y divide-line-subtle">
          {summary.sources.map((source) => {
            const state = source.lastRun ? RUN_STATES[source.lastRun.status] : null
            const Icon = state?.icon ?? CircleDashed
            return (
              <li key={source.source} className="px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2">
                    <SourceTag source={source.source} label={source.label} />
                    <span className="truncate text-label text-fg">{source.name}</span>
                  </p>
                  <span className="shrink-0 text-caption tabular text-fg-muted">
                    {source.records.toLocaleString()} {source.records === 1 ? 'record' : 'records'}
                  </span>
                </div>
                <p className={cn('mt-2 flex items-center gap-1.5 text-caption', state ? state.className : 'text-fg-subtle')}>
                  <Icon aria-hidden="true" size={13} className={source.lastRun?.status === 'running' ? 'motion-safe:animate-spin' : undefined} />
                  {state ? state.label : 'Not synced yet'}
                </p>
                {source.lastSuccessAt && (
                  <p className="mt-0.5 text-caption text-fg-subtle">
                    Up to date as of{' '}
                    <time dateTime={source.lastSuccessAt} title={formatDate(source.lastSuccessAt)}>
                      {timeAgo(source.lastSuccessAt)}
                    </time>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
