import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { SelectField } from '@/design-system/components'
import { cn } from '@/lib/cn'
import { SOFTWARE_ECOSYSTEMS, SOFTWARE_RELATIONSHIPS, SOFTWARE_SCOPES, SOFTWARE_SORTS, SOFTWARE_VERSION_FILTERS } from '../softwareCatalog'
import { activeFilterCount } from '../softwareQuery'

const any = (label, entries) => [{ value: '', label }, ...entries.map(({ value, label: text }) => ({ value, label: text }))]

/**
 * Debounced search box (300 ms; Enter applies immediately), styled like the
 * asset inventory search. `value` is the applied query; typing is local.
 */
export function SearchBox({ value, onChange, label, placeholder, className }) {
  const id = useId()
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)

  // The applied value changed elsewhere (clear filters, back/forward): reflect it,
  // unless it is just the debounced echo of what is being typed.
  if (value !== synced) {
    setSynced(value)
    if (value !== text.trim()) setText(value)
  }

  useEffect(() => {
    if (text.trim() === value) return undefined
    const timer = setTimeout(() => onChange(text.trim()), 300)
    return () => clearTimeout(timer)
  }, [text, value, onChange])

  return (
    <div className={cn('relative min-w-0', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <input
        id={id}
        type="search"
        value={text}
        maxLength={100}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onChange(text.trim())
        }}
        className={cn(
          'peer h-11 w-full rounded-md bg-surface-well pl-10 pr-10 text-body text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] ring-1 ring-inset ring-line',
          'placeholder:text-fg-subtle transition-[box-shadow] duration-[var(--duration-fast)] hover:ring-line-strong focus:outline-none focus:ring-2 focus:ring-ion/80',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      <span
        aria-hidden="true"
        className="brackets pointer-events-none absolute -inset-[5px] rounded-[14px] opacity-0 transition-opacity duration-[var(--duration-base)] peer-focus:opacity-100"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('')
            onChange('')
          }}
          className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-sm text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ion"
        >
          <X aria-hidden="true" size={15} />
        </button>
      )}
    </div>
  )
}

/** Search, filters and sort for the organization-wide software inventory. Writes to the URL via `onChange`. */
export function SoftwareToolbar({ query, onChange }) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = activeFilterCount(query)
  const selects = [
    { key: 'ecosystem', label: 'Ecosystem', options: any('Any ecosystem', SOFTWARE_ECOSYSTEMS) },
    { key: 'relationship', label: 'Dependency', options: any('Any dependency', SOFTWARE_RELATIONSHIPS) },
    { key: 'scope', label: 'Scope', options: any('Any scope', SOFTWARE_SCOPES) },
    { key: 'version', label: 'Version', options: any('Any version', SOFTWARE_VERSION_FILTERS) },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchBox
          value={query.q}
          onChange={(q) => onChange({ q })}
          label="Search software by package, vendor or package URL"
          placeholder="Search package, vendor or purl…"
          className="flex-1 basis-56"
        />
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="software-filters"
          onClick={() => setFiltersOpen((open) => !open)}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-md px-3.5 text-label ring-1 ring-inset transition-colors lg:hidden',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion',
            filters ? 'bg-ion-dim text-ion ring-ion/40' : 'bg-surface-raised text-fg-muted ring-line hover:text-fg',
          )}
        >
          <SlidersHorizontal aria-hidden="true" size={15} />
          Filters{filters ? ` · ${filters}` : ''}
        </button>
        <SelectField
          compact
          aria-label="Sort software by"
          value={query.sort || 'name'}
          options={SOFTWARE_SORTS.map((s) => ({ value: s.value, label: `Sort: ${s.label}` }))}
          onChange={(event) => onChange({ sort: event.target.value === 'name' ? '' : event.target.value, order: '' })}
          className="w-full sm:w-52"
        />
      </div>

      {/* Always visible from 1024px; a disclosure on smaller screens. */}
      <div
        id="software-filters"
        role="group"
        aria-label="Filters"
        className={cn('grid grid-cols-1 gap-2 xs:grid-cols-2 xl:grid-cols-4', !filtersOpen && 'max-lg:hidden')}
      >
        {selects.map((select) => (
          <SelectField
            key={select.key}
            compact
            aria-label={select.label}
            value={query[select.key]}
            options={select.options}
            onChange={(event) => onChange({ [select.key]: event.target.value })}
            selectClassName={query[select.key] ? 'ring-ion/50 text-fg' : 'text-fg-muted'}
          />
        ))}
      </div>
    </div>
  )
}
