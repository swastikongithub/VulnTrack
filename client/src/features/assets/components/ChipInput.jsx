import { X } from 'lucide-react'
import { useId, useState } from 'react'
import { FieldMessage } from '@/design-system/components'
import { cn } from '@/lib/cn'

/**
 * List-of-strings entry (tags, technologies). Enter or comma adds the typed
 * value, Backspace on an empty input removes the last chip, and each chip has
 * a labelled remove button. `normalize` shapes a value (e.g. lower-case tags);
 * `validate` returns an error message or undefined.
 */
export function ChipInput({ id: idProp, label, values, onChange, max, normalize = (v) => v.trim(), validate, placeholder, error, hint, mono = false }) {
  const autoId = useId()
  const id = idProp ?? autoId
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const messageId = `${id}-message`
  const shownError = draftError ?? error

  const add = () => {
    const value = normalize(draft)
    if (!value) return false
    const problem =
      validate?.(value) ??
      (values.some((v) => v.toLowerCase() === value.toLowerCase()) ? 'Already added' : undefined) ??
      (values.length >= max ? `Up to ${max}` : undefined)
    if (problem) {
      setDraftError(problem)
      return false
    }
    onChange([...values, value])
    setDraft('')
    setDraftError(null)
    setAnnouncement(`Added ${value}`)
    return true
  }

  const remove = (value) => {
    onChange(values.filter((v) => v !== value))
    setAnnouncement(`Removed ${value}`)
  }

  return (
    <div className="pb-2">
      <div className="flex min-h-5 items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label text-fg">
          {label}
        </label>
        <span className="text-caption tabular text-fg-subtle" aria-hidden="true">
          {values.length}/{max}
        </span>
      </div>
      {/* Clicking anywhere in the well focuses the text input, so the whole 48px+ area is the target. */}
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault()
            event.currentTarget.querySelector('input')?.focus()
          }
        }}
        className={cn(
          'group/chips relative mt-2 flex min-h-12 cursor-text flex-wrap items-center gap-1.5 rounded-md bg-surface-well px-2 py-1.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] ring-1 ring-inset',
          'transition-[box-shadow] duration-[var(--duration-fast)] focus-within:ring-2',
          shownError ? 'ring-danger/70 focus-within:ring-danger' : 'ring-line hover:ring-line-strong focus-within:ring-ion/80',
        )}
      >
        <ul className="contents" aria-label={`${label}: ${values.length ? values.join(', ') : 'none'}`}>
          {values.map((value) => (
            <li
              key={value}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-sm bg-surface-hover pl-2 text-caption text-fg ring-1 ring-inset ring-line-strong',
                mono && 'font-mono',
              )}
            >
              {value}
              <button
                type="button"
                onClick={() => remove(value)}
                aria-label={`Remove ${value}`}
                className="relative grid size-8 place-items-center rounded-sm text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ion before:absolute before:-inset-1.5"
              >
                <X aria-hidden="true" size={13} />
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          value={draft}
          placeholder={values.length ? '' : placeholder}
          aria-describedby={messageId}
          aria-invalid={Boolean(shownError) || undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value)
            if (draftError) setDraftError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              if (draft.trim()) {
                event.preventDefault()
                add()
              } else if (event.key === 'Enter') {
                event.preventDefault()
              }
            } else if (event.key === 'Backspace' && !draft && values.length) {
              remove(values[values.length - 1])
            }
          }}
          onBlur={() => {
            if (draft.trim()) add()
          }}
          className={cn('h-9 min-w-[8rem] flex-1 bg-transparent px-1.5 text-body-lg text-fg placeholder:text-fg-subtle focus:outline-none', mono && 'font-mono text-body')}
        />
      </div>
      <FieldMessage id={messageId} error={shownError} hint={hint ?? 'Press Enter or comma to add'} />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
