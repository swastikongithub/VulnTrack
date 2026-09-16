import { Check } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/cn'

/** Native checkbox (keyboard + form semantics preserved) with a custom visual. */
export function Checkbox({ id: idProp, label, description, className, ...props }) {
  const autoId = useId()
  const id = idProp ?? autoId

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="relative mt-px grid size-5 shrink-0 place-items-center">
        <input
          id={id}
          type="checkbox"
          aria-describedby={description ? `${id}-description` : undefined}
          className={cn(
            'peer absolute -left-3 -top-3 size-11 cursor-pointer appearance-none rounded-sm',
            'focus-visible:outline-none',
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none grid size-5 place-items-center rounded-[5px] bg-surface-well ring-1 ring-inset ring-line-strong',
            'transition-[background-color,box-shadow] duration-[var(--duration-fast)]',
            'peer-hover:ring-fg-subtle peer-checked:bg-ion peer-checked:ring-ion',
            'peer-focus-visible:shadow-[0_0_0_2px_var(--color-ink-850),0_0_0_4px_var(--color-ion)]',
            '[&>svg]:scale-50 [&>svg]:opacity-0 peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100',
          )}
        >
          <Check
            size={14}
            strokeWidth={3}
            className="text-on-ion transition-[transform,opacity] duration-[var(--duration-base)] ease-[var(--ease-enter)]"
          />
        </span>
      </span>
      <span className="min-w-0">
        <label htmlFor={id} className="text-label font-normal text-fg-muted">
          {label}
        </label>
        {description && (
          <span id={`${id}-description`} className="block text-caption text-fg-subtle">
            {description}
          </span>
        )}
      </span>
    </div>
  )
}
