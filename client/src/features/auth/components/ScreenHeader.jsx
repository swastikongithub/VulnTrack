import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { StaggerItem } from './Stagger'

const TONE = {
  ion: 'text-ion',
  iris: 'text-iris',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/**
 * Screen heading block: mono eyebrow (step marker), h1, supporting copy.
 * The h1 is programmatically focusable (tabIndex -1). Pass `focusOnMount`
 * when the heading appears as the result of an in-page state change
 * (e.g. "Check your inbox") so screen-reader users hear the new context.
 */
export const ScreenHeader = forwardRef(function ScreenHeader(
  { eyebrow, title, children, tone = 'ion', focusOnMount = false, className },
  forwardedRef,
) {
  const localRef = useRef(null)

  useEffect(() => {
    if (focusOnMount) localRef.current?.focus({ preventScroll: true })
  }, [focusOnMount])

  const setRef = (el) => {
    localRef.current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }

  return (
    <StaggerItem className={cn('mb-8', className)}>
      {eyebrow && (
        <p className={cn('eyebrow mb-4 flex items-center gap-2.5', TONE[tone])}>
          <span aria-hidden="true" className="h-px w-5 bg-current opacity-70" />
          {eyebrow}
        </p>
      )}
      <h1 ref={setRef} tabIndex={-1} className="text-title-1 text-fg focus:outline-none sm:text-[2.125rem]">
        {title}
      </h1>
      {children && <div className="mt-3 text-body text-fg-muted">{children}</div>}
    </StaggerItem>
  )
})
