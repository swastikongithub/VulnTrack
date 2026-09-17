import { ChevronDown } from 'lucide-react'
import { forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'
import { FieldMessage } from './TextField'

const control =
  'peer block w-full appearance-none rounded-md bg-surface-well pr-10 text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] ' +
  'ring-1 ring-inset transition-[box-shadow,background-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)] ' +
  'focus:bg-ink-700/60 focus:outline-none focus:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Native <select> styled like TextField: same well, ring states and
 * instrument-bracket focus accent. Native keeps keyboard, screen-reader and
 * mobile picker behavior correct.
 *
 * `compact` renders a 44px control without label row or message row (for use
 * inside table rows); it then requires an accessible `aria-label`.
 */
export const SelectField = forwardRef(function SelectField(
  { id: idProp, label, error, hint, options, compact = false, className, selectClassName, ...props },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  const messageId = `${id}-message`
  const invalid = Boolean(error)

  const select = (
    <div className="relative">
      <select
        ref={ref}
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={compact ? undefined : messageId}
        className={cn(
          control,
          compact ? 'h-11 pl-3 text-label' : 'h-12 pl-3.5 text-body-lg',
          invalid ? 'ring-danger/70 hover:ring-danger focus:ring-danger' : 'ring-line hover:ring-line-strong focus:ring-ion/80',
          selectClassName,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-ink-800 text-fg">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        size={16}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors peer-focus:text-ion"
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
  )

  if (compact) return <div className={className}>{select}</div>

  return (
    <div className={cn('group/field pb-2', className)}>
      <div className="flex min-h-5 items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label text-fg">
          {label}
        </label>
      </div>
      <div className="mt-2">{select}</div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  )
})
