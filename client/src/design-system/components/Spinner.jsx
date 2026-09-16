import { cn } from '@/lib/cn'

/** Indeterminate progress arc. Decorative — pair with visible/ARIA status text. */
export function Spinner({ className, size = 16 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('motion-essential animate-spin', className)}
      style={{ animationDuration: '0.8s' }}
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
