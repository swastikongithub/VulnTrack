import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { Stagger, StaggerItem } from '@/features/auth/components/Stagger'

export { Stagger, StaggerItem }

/**
 * Page heading for the organization area: mono eyebrow, h1, supporting copy.
 * The h1 takes focus on client-side navigation (after the first render) so
 * screen-reader users land at the start of the new page.
 */
export const PageHeader = forwardRef(function PageHeader({ eyebrow, title, children, aside, className }, forwardedRef) {
  const localRef = useRef(null)

  useEffect(() => {
    // Skip initial page load (focus stays at the document start); focus on in-app navigation.
    if (window.history.state?.idx > 0) localRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <StaggerItem className={cn('mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5', className)}>
      <div className="min-w-0 max-w-2xl">
        <p className="eyebrow mb-4 flex items-center gap-2.5 text-ion">
          <span aria-hidden="true" className="h-px w-5 bg-current opacity-70" />
          {eyebrow}
        </p>
        <h1
          ref={(el) => {
            localRef.current = el
            if (typeof forwardedRef === 'function') forwardedRef(el)
            else if (forwardedRef) forwardedRef.current = el
          }}
          tabIndex={-1}
          className="text-title-1 text-fg focus:outline-none sm:text-[2.125rem]"
        >
          {title}
        </h1>
        {children && <div className="mt-3 text-body text-fg-muted">{children}</div>}
      </div>
      {aside}
    </StaggerItem>
  )
})

/** Instrument-style readouts: real counts only, never decorative telemetry. */
export function Readouts({ items, className }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line-subtle ring-1 ring-line sm:grid-cols-3', className)}>
      {items.map((item) => (
        <div key={item.label} className="relative bg-surface/95 px-4 py-3.5 last:col-span-2 sm:last:col-span-1">
          <dt className="eyebrow text-fg-subtle">{item.label}</dt>
          <dd className="mt-1.5 truncate text-title-2 tabular text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Section card with a header row. */
export function Panel({ title, eyebrow, description, actions, children, className, headingId, as: Component = 'section' }) {
  return (
    <Component
      aria-labelledby={headingId}
      className={cn('relative rounded-xl bg-surface/95 shadow-e1 ring-1 ring-line', className)}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(124_220_255/0.28),transparent)]"
      />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line-subtle px-5 py-4 sm:px-6">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5 text-fg-subtle">{eyebrow}</p>}
          {/* Focusable so focus has a sensible home when the row that held it is removed. */}
          <h2 id={headingId} tabIndex={-1} className="text-label font-medium text-fg focus:outline-none">
            {title}
          </h2>
          {description && <p className="mt-1 text-caption text-fg-subtle">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Component>
  )
}

/** Loading placeholder rows (static under reduced motion). */
export function SkeletonRows({ rows = 3, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line-subtle">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 sm:px-6">
          <span className="size-10 shrink-0 animate-pulse rounded-full bg-surface-hover" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-1/3 animate-pulse rounded bg-surface-hover" />
            <span className="block h-3 w-1/2 animate-pulse rounded bg-surface-raised" />
          </span>
          <span className="hidden h-7 w-24 animate-pulse rounded-full bg-surface-hover sm:block" />
        </div>
      ))}
    </div>
  )
}
