import {
  AppWindow,
  Archive,
  Boxes,
  Cloud,
  Container,
  Database,
  GitBranch,
  Globe,
  Network,
  Server,
  Smartphone,
  Webhook,
} from 'lucide-react'
import { cn } from '@/lib/cn'

const TYPE_ICONS = {
  web_application: AppWindow,
  api: Webhook,
  server: Server,
  database: Database,
  container: Container,
  repository: GitBranch,
  cloud_resource: Cloud,
  mobile_application: Smartphone,
  network_device: Network,
  other: Boxes,
}

/** Type tile: icon inside an instrument ring. Decorative — the type label is always shown nearby. */
export function AssetTypeIcon({ type, size = 'md', className }) {
  const Icon = TYPE_ICONS[type] ?? Boxes
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative grid shrink-0 place-items-center rounded-md bg-ink-800 text-fg-muted ring-1 ring-inset ring-line',
        size === 'lg' ? 'size-14 rounded-lg text-ion ring-ion/25' : 'size-10',
        className,
      )}
    >
      <Icon size={size === 'lg' ? 24 : 17} strokeWidth={1.75} />
    </span>
  )
}

const CRITICALITY = {
  critical: { rank: 4, text: 'text-sev-critical', bar: 'bg-sev-critical' },
  high: { rank: 3, text: 'text-sev-high', bar: 'bg-sev-high' },
  medium: { rank: 2, text: 'text-sev-medium', bar: 'bg-sev-medium' },
  low: { rank: 1, text: 'text-sev-low', bar: 'bg-sev-low' },
}

/**
 * Business criticality as a four-segment instrument meter plus its label.
 * Uses the severity ramp for recognisability, but as a meter (not a pill) so it
 * can't be confused with a vulnerability severity badge later. Never color alone.
 */
export function CriticalityMeter({ criticality, label, compact = false, className }) {
  const tone = CRITICALITY[criticality] ?? CRITICALITY.low
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden="true" className="inline-flex items-end gap-[3px]">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn('w-[3px] rounded-full', segment <= tone.rank ? tone.bar : 'bg-ink-600')}
            style={{ height: compact ? 5 + segment * 2 : 6 + segment * 2.5 }}
          />
        ))}
      </span>
      <span className={cn('text-caption font-medium', tone.text)}>
        <span className="sr-only">Criticality: </span>
        {label}
      </span>
    </span>
  )
}

const STATUS_TONES = {
  planned: 'text-info ring-info/25 bg-info-dim',
  active: 'text-success ring-success/25 bg-success-dim',
  deprecated: 'text-warning ring-warning/25 bg-warning-dim',
  retired: 'text-fg-subtle ring-line bg-surface-raised',
}

/** Lifecycle chip: dot + label. */
export function LifecycleChip({ status, label, className }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption ring-1 ring-inset',
        STATUS_TONES[status] ?? STATUS_TONES.retired,
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      <span className="sr-only">Lifecycle: </span>
      {label}
    </span>
  )
}

/** Neutral metadata chip (environment, exposure, archived). */
export function MetaChip({ children, icon: Icon, tone = 'neutral', className }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption ring-1 ring-inset',
        tone === 'signal' && 'bg-ion-dim text-ion ring-ion/30',
        tone === 'warning' && 'bg-warning-dim text-warning ring-warning/25',
        tone === 'neutral' && 'bg-surface-raised text-fg-muted ring-line',
        className,
      )}
    >
      {Icon && <Icon aria-hidden="true" size={13} />}
      {children}
    </span>
  )
}

export function ExposureChip({ exposure, label }) {
  if (exposure === 'internet_facing') {
    return (
      <MetaChip icon={Globe} tone="signal">
        {label}
      </MetaChip>
    )
  }
  return <MetaChip>{label}</MetaChip>
}

export function ArchivedChip() {
  return (
    <MetaChip icon={Archive} tone="warning">
      Archived
    </MetaChip>
  )
}

export function TagList({ tags, className }) {
  if (!tags?.length) return null
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag} className="rounded-sm bg-surface-hover px-2 py-0.5 font-mono text-eyebrow text-fg-muted ring-1 ring-inset ring-line">
          {tag}
        </li>
      ))}
    </ul>
  )
}
