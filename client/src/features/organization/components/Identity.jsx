import { cn } from '@/lib/cn'

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Person marker: initials in a hairline ring. Decorative — the name is always shown beside it. */
export function Avatar({ name, highlight = false, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full bg-surface-hover text-caption font-medium tracking-wide ring-1 ring-inset',
        highlight ? 'text-ion ring-ion/40' : 'text-fg-muted ring-line',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

/** Organization marker: initials inside a small instrument tile with an open perimeter arc. */
export function OrganizationMark({ name, size = 'md', className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative grid shrink-0 place-items-center rounded-md bg-ink-800 font-mono text-ion ring-1 ring-inset ring-ion/25',
        size === 'sm' ? 'size-8 text-eyebrow' : 'size-9 text-caption',
        className,
      )}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full" fill="none">
        <path d="M30 13.5A13 13 0 1 1 22.6 5.8" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="27.4" cy="9" r="1.6" fill="currentColor" fillOpacity="0.8" />
      </svg>
      <span className="relative">{initials(name)}</span>
    </span>
  )
}

const ROLE_TONES = {
  owner: 'text-ion ring-ion/30 bg-ion-dim',
  admin: 'text-iris ring-iris/30 bg-iris-dim',
  security_analyst: 'text-info ring-info/25 bg-info-dim',
  developer: 'text-fg-muted ring-line-strong bg-surface-hover',
  viewer: 'text-fg-subtle ring-line bg-surface-raised',
}

/** Role chip. Tone aids scanning; the label always carries the meaning. */
export function RoleBadge({ role, label, className }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption ring-1 ring-inset',
        ROLE_TONES[role] ?? ROLE_TONES.viewer,
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
