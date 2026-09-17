import { Spinner } from '@/design-system/components'

/** Shown while a lazily loaded route (the organization area) is fetched. */
export function RouteLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950" role="status">
      <span className="flex items-center gap-3 text-label text-fg-muted">
        <Spinner size={18} className="text-ion" />
        Loading
      </span>
    </div>
  )
}
