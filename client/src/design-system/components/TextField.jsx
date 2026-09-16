import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, Info } from 'lucide-react'
import { forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'
import { duration, ease } from '../motion/tokens'

/**
 * Field message row. Space is always reserved (min-height) so errors appear
 * without shifting the layout; messages crossfade in place.
 */
export function FieldMessage({ id, error, warning, hint }) {
  const tone = error ? 'error' : warning ? 'warning' : hint ? 'hint' : 'none'
  const text = error || warning || hint

  return (
    <div id={id} className="relative mt-1.5 min-h-5 text-caption" aria-live="polite">
      <AnimatePresence initial={false} mode="wait">
        {text && (
          <motion.p
            key={`${tone}:${text}`}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: duration.instant, ease: ease.exit } }}
            transition={{ duration: duration.fast, ease: ease.enter }}
            className={cn(
              'flex items-start gap-1.5',
              tone === 'error' && 'text-danger',
              tone === 'warning' && 'text-warning',
              tone === 'hint' && 'text-fg-subtle',
            )}
          >
            {tone === 'error' && <CircleAlert aria-hidden="true" size={14} className="mt-[3px] shrink-0" />}
            {tone === 'warning' && <Info aria-hidden="true" size={14} className="mt-[3px] shrink-0" />}
            <span>
              {tone === 'error' && <span className="sr-only">Error: </span>}
              {text}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * TextField — label above, 48px input, reserved message row.
 * Focus shows a solid ring plus the instrument-bracket accent.
 */
export const TextField = forwardRef(function TextField(
  {
    id: idProp,
    label,
    labelAction,
    error,
    warning,
    hint,
    leadingIcon,
    trailing,
    className,
    inputClassName,
    required = true,
    ...inputProps
  },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  const messageId = `${id}-message`
  const invalid = Boolean(error)

  return (
    <div className={cn('group/field pb-2', className)}>
      <div className="flex min-h-5 items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label text-fg">
          {label}
        </label>
        {labelAction}
      </div>

      <div className="relative mt-2">
        {leadingIcon && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-fg-subtle transition-colors duration-[var(--duration-fast)]',
              'group-focus-within/field:text-ion',
              invalid && 'text-danger/80 group-focus-within/field:text-danger',
            )}
          >
            {leadingIcon}
          </span>
        )}

        <input
          ref={ref}
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={messageId}
          aria-required={required || undefined}
          className={cn(
            'peer block h-12 w-full rounded-md bg-surface-well text-body-lg text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]',
            'ring-1 ring-inset placeholder:text-fg-subtle',
            'transition-[box-shadow,background-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            'focus:bg-ink-700/60 focus:outline-none focus:ring-2 focus-visible:outline-none disabled:opacity-50',
            // Mutually exclusive state classes — never let two ring colors compete in the cascade
            invalid ? 'ring-danger/70 hover:ring-danger focus:ring-danger' : 'ring-line hover:ring-line-strong focus:ring-ion/80',
            leadingIcon ? 'pl-11' : 'pl-3.5',
            trailing ? 'pr-12' : 'pr-3.5',
            inputClassName,
          )}
          {...inputProps}
        />

        {/* Instrument brackets — focus accent */}
        <span
          aria-hidden="true"
          className={cn(
            'brackets pointer-events-none absolute -inset-[5px] rounded-[14px] opacity-0 scale-[1.015]',
            'transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-enter)]',
            'peer-focus:scale-100 peer-focus:opacity-100',
            invalid && '[--bracket-color:var(--color-danger)]',
          )}
        />

        {trailing && <div className="absolute inset-y-0 right-0.5 flex items-center">{trailing}</div>}
      </div>

      <FieldMessage id={messageId} error={error} warning={warning} hint={hint} />
    </div>
  )
})
