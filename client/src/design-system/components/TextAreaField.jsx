import { forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'
import { FieldMessage } from './TextField'

/**
 * Multi-line text field with the TextField well, ring states, bracket focus
 * accent and reserved message row. Shows a character counter when `maxLength`
 * is set (announced only through the visible text, not live).
 */
export const TextAreaField = forwardRef(function TextAreaField(
  { id: idProp, label, error, hint, className, rows = 4, maxLength, value = '', required = false, ...props },
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
        {maxLength && (
          <span className="text-caption tabular text-fg-subtle" aria-hidden="true">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <div className="relative mt-2">
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          value={value}
          maxLength={maxLength}
          aria-invalid={invalid || undefined}
          aria-describedby={messageId}
          aria-required={required || undefined}
          className={cn(
            'peer block w-full resize-y rounded-md bg-surface-well px-3.5 py-3 text-body-lg text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]',
            'ring-1 ring-inset placeholder:text-fg-subtle',
            'transition-[box-shadow,background-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            'focus:bg-ink-700/60 focus:outline-none focus:ring-2 focus-visible:outline-none',
            invalid ? 'ring-danger/70 hover:ring-danger focus:ring-danger' : 'ring-line hover:ring-line-strong focus:ring-ion/80',
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'brackets pointer-events-none absolute -inset-[5px] rounded-[14px] opacity-0 scale-[1.015]',
            'transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-enter)]',
            'peer-focus:scale-100 peer-focus:opacity-100',
            invalid && '[--bracket-color:var(--color-danger)]',
          )}
        />
      </div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  )
})
