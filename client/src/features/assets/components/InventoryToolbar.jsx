import { motion } from 'framer-motion'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { SelectField } from '@/design-system/components'
import { spring } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'
import { ASSET_CRITICALITIES, ASSET_ENVIRONMENTS, ASSET_EXPOSURES, ASSET_SORTS, ASSET_STATUSES, ASSET_TYPES } from '../assetCatalog'
import { activeFilterCount } from '../inventoryQuery'

const any = (label, entries) => [{ value: '', label }, ...entries]

/**
 * Search, filters, sort and the live/archived view switch. Everything writes
 * to the URL through `onChange`; the search box debounces (300 ms).
 */
export function InventoryToolbar({ query, onChange, tags = [], counts }) {
  const searchId = useId()
  const [search, setSearch] = useState(query.q)
  const [syncedQ, setSyncedQ] = useState(query.q)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = activeFilterCount(query)

  // The URL changed elsewhere (back/forward, clear filters): reflect it in the box,
  // unless it is just the debounced echo of what is being typed.
  if (query.q !== syncedQ) {
    setSyncedQ(query.q)
    if (query.q !== search.trim()) setSearch(query.q)
  }

  useEffect(() => {
    if (search.trim() === query.q) return undefined
    const id = setTimeout(() => onChange({ q: search.trim() }), 300)
    return () => clearTimeout(id)
  }, [search, query.q, onChange])

  const tagOptions = any('Any tag', tags.map(({ tag, count }) => ({ value: tag, label: `${tag} (${count})` })))
  if (query.tag && !tags.some((t) => t.tag === query.tag)) tagOptions.push({ value: query.tag, label: query.tag })

  const selects = [
    { key: 'type', label: 'Type', options: any('Any type', ASSET_TYPES) },
    { key: 'environment', label: 'Environment', options: any('Any environment', ASSET_ENVIRONMENTS) },
    { key: 'criticality', label: 'Criticality', options: any('Any criticality', ASSET_CRITICALITIES) },
    { key: 'exposure', label: 'Exposure', options: any('Any exposure', ASSET_EXPOSURES) },
    { key: 'status', label: 'Lifecycle', options: any('Any lifecycle', ASSET_STATUSES) },
    { key: 'tag', label: 'Tag', options: tagOptions },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewSwitch archived={query.archived === 'true'} counts={counts} onChange={(archived) => onChange({ archived: archived ? 'true' : '' })} />

        <div className="relative min-w-0 flex-1 basis-56">
          <label htmlFor={searchId} className="sr-only">
            Search assets by name, identifier, tag, technology or team
          </label>
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            id={searchId}
            type="search"
            value={search}
            maxLength={100}
            placeholder="Search name, identifier, tag, technology…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onChange({ q: search.trim() })
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
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch('')
                onChange({ q: '' })
              }}
              className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-sm text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ion"
            >
              <X aria-hidden="true" size={15} />
            </button>
          )}
        </div>

        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="inventory-filters"
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
          aria-label="Sort assets by"
          value={query.sort || 'name'}
          options={ASSET_SORTS.map((s) => ({ value: s.value, label: `Sort: ${s.label}` }))}
          onChange={(event) => onChange({ sort: event.target.value === 'name' ? '' : event.target.value, order: '' })}
          className="w-full sm:w-52"
        />
      </div>

      {/* Always visible from 1024px; a disclosure on smaller screens. */}
      <div
        id="inventory-filters"
        role="group"
        aria-label="Filters"
        className={cn('grid grid-cols-1 gap-2 xs:grid-cols-2 md:grid-cols-3 3xl:grid-cols-6', !filtersOpen && 'max-lg:hidden')}
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

/** Live / Archived toggle buttons with the shared-layout indicator used by the auth ModeSwitch. */
function ViewSwitch({ archived, onChange, counts }) {
  const items = [
    { value: false, label: 'Live', count: counts?.total },
    { value: true, label: 'Archived', count: counts?.archived },
  ]
  return (
    <div role="group" aria-label="Inventory view" className="relative grid w-full grid-cols-2 rounded-md bg-ink-900/80 p-1 ring-1 ring-inset ring-line sm:w-auto">
      {items.map((item) => {
        const active = archived === item.value
        return (
          <button
            key={item.label}
            type="button"
            aria-pressed={active}
            onClick={() => !active && onChange(item.value)}
            className={cn(
              'relative flex h-11 items-center lg:h-9 justify-center gap-2 rounded-[7px] px-3.5 text-label transition-colors duration-[var(--duration-fast)]',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ion',
              active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId="inventory-view-indicator"
                transition={spring.layout}
                className="absolute inset-0 rounded-[7px] bg-surface-hover shadow-e1 ring-1 ring-inset ring-line-strong"
              />
            )}
            <span className="relative">{item.label}</span>
            {typeof item.count === 'number' && <span className="relative tabular text-caption text-fg-subtle">{item.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
