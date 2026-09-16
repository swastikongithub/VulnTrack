import { cn } from '@/lib/cn'

/**
 * VulnTrack mark: an open perimeter ring (the attack surface), an inner
 * verification arc, a tracked node on the boundary and the protected core.
 */
export function LogoMark({ size = 28, className }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width={size} height={size} fill="none" className={className}>
      <path d="M26.2 11.7A10.8 10.8 0 1 1 20.3 5.9" stroke="var(--color-ion)" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M21.6 16a5.6 5.6 0 1 1-2.4-4.6"
        stroke="var(--color-ion)"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="24.3" cy="7.7" r="2.5" fill="var(--color-ion)" />
      <circle cx="16" cy="16" r="1.9" fill="var(--color-fg)" />
    </svg>
  )
}

export function Logo({ className, size = 28 }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span className="text-[1.0625rem] font-[600] tracking-[-0.02em] text-fg">
        Vuln<span className="text-fg-muted">Track</span>
      </span>
    </span>
  )
}
