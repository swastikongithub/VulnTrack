import { motion } from 'framer-motion'
import { useEffect, useId, useRef } from 'react'
import { cn } from '@/lib/cn'
import { duration, ease } from '../motion/tokens'

/**
 * Modal dialog built on the native <dialog> element: showModal() provides the
 * focus trap, inert background, Escape handling and top-layer stacking, so no
 * focus-trap code is needed. Focus returns to the previously focused element
 * on close.
 *
 * Render it only while open (e.g. `{target && <Dialog … />}`).
 * `initialFocusRef` should point at the least destructive action.
 * Content taller than the viewport scrolls inside the panel.
 */
export function Dialog({ title, description, children, onClose, initialFocusRef, tone = 'default', className }) {
  const ref = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    dialog.showModal()
    initialFocusRef?.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
    // Opens once per mount: the ref object is stable, so this never re-runs.
  }, [initialFocusRef])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> element itself.
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'm-auto w-[min(28rem,calc(100vw-2rem))] overflow-visible bg-transparent p-0 text-fg',
        'backdrop:bg-ink-950/75',
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: duration.moderate, ease: ease.enter }}
        className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-xl bg-surface p-6 shadow-e3 ring-1 ring-line-strong"
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-8 top-0 h-px',
            tone === 'danger'
              ? 'bg-[linear-gradient(90deg,transparent,rgb(255_115_133/0.55),transparent)]'
              : 'bg-[linear-gradient(90deg,transparent,rgb(124_220_255/0.45),transparent)]',
          )}
        />
        <h2 id={titleId} className="text-title-2 text-fg">
          {title}
        </h2>
        {description && (
          <div id={descriptionId} className="mt-2 text-body text-fg-muted">
            {description}
          </div>
        )}
        <div className="mt-6">{children}</div>
      </motion.div>
    </dialog>
  )
}
