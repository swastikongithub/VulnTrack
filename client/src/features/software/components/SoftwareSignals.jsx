import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ecosystemOf } from '../softwareCatalog'

/**
 * Ecosystem tile: a short mono label in an instrument ring, the software
 * counterpart of AssetTypeIcon. Decorative — the ecosystem label is always
 * shown in text nearby.
 */
export function EcosystemBadge({ ecosystem, className }) {
  const entry = ecosystemOf(ecosystem)
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-md bg-ink-800 font-mono text-[0.625rem] font-medium uppercase tracking-[0.06em] ring-1 ring-inset',
        ecosystem === 'generic' ? 'text-fg-muted ring-line' : 'text-ion ring-ion/25',
        className,
      )}
    >
      {entry?.short ?? '?'}
    </span>
  )
}

/**
 * Version as recorded, in mono. An unknown version is called out: it can't be
 * checked against affected ranges later.
 */
export function VersionText({ version, className }) {
  if (!version) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-caption text-warning', className)}>
        <CircleHelp aria-hidden="true" size={13} />
        Unknown
        <span className="sr-only"> version</span>
      </span>
    )
  }
  return <code className={cn('break-all font-mono text-caption text-fg', className)}>{version}</code>
}
