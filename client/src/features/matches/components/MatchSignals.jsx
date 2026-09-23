import { CircleHelp, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * A match says what the catalogue claims about installed software. Its own
 * signals never borrow the severity ramp: severity belongs to the advisory
 * (SeverityBadge), while status and confidence describe *this* conclusion.
 */

const STATUS_STYLES = {
  affected: { className: 'bg-danger-dim text-danger ring-danger/30', icon: ShieldAlert },
  unknown_version: { className: 'bg-warning-dim text-warning ring-warning/25', icon: CircleHelp },
  undetermined: { className: 'bg-surface-raised text-fg-muted ring-line', icon: ShieldQuestion },
}

export function MatchStatusChip({ status, label, className }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.undetermined
  const Icon = style.icon
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption ring-1 ring-inset', style.className, className)}>
      <Icon aria-hidden="true" size={13} />
      {label}
    </span>
  )
}

/** How much the conclusion can be leaned on. Neutral by design: it is a qualifier, not an alarm. */
export function ConfidenceChip({ confidence, label, className }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption ring-1 ring-inset',
        confidence === 'high' ? 'bg-surface-raised text-fg ring-line-strong' : 'bg-surface-raised text-fg-subtle ring-line',
        className,
      )}
    >
      <span aria-hidden="true" className="flex gap-0.5">
        {['high', 'medium', 'low'].map((level, i) => (
          <span
            key={level}
            className={cn('h-2.5 w-0.5 rounded-full', i < { high: 3, medium: 2, low: 1 }[confidence] ? 'bg-current' : 'bg-current opacity-25')}
          />
        ))}
      </span>
      {label} confidence
    </span>
  )
}

/** "Fixed in 4.17.21" — the single most useful thing a match can tell someone. */
export function FixedIn({ versions, className }) {
  if (!versions?.length) return null
  return (
    <span className={cn('text-caption text-success', className)}>
      Fixed in <span className="font-mono">{versions.slice(0, 3).join(', ')}</span>
      {versions.length > 3 ? ` +${versions.length - 3}` : ''}
    </span>
  )
}
