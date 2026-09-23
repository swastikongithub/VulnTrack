import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { SelectField } from '@/design-system/components'
import { SearchBox } from '@/features/software/components/SoftwareToolbar'
import { SEVERITIES } from '@/features/vulnerabilities/vulnerabilityCatalog'
import { cn } from '@/lib/cn'
import { ARCHIVED_FILTERS, MATCH_CONFIDENCES, MATCH_SORTS, MATCH_STATUSES } from '../matchCatalog'
import { activeFilterCount, ECOSYSTEM_FILTERS } from '../matchQuery'

const any = (label, entries) => [{ value: '', label }, ...entries.map(({ value, label: text }) => ({ value, label: text }))]

/** Search, filters and sort for the matches list. Writes to the URL via `onChange`. */
export function MatchToolbar({ query, onChange }) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = activeFilterCount(query)
  const selects = [
    { key: 'status', label: 'Match status', options: any('Any match status', MATCH_STATUSES) },
    { key: 'severity', label: 'Severity', options: any('Any severity', SEVERITIES) },
    { key: 'confidence', label: 'Confidence', options: any('Any confidence', MATCH_CONFIDENCES) },
    { key: 'ecosystem', label: 'Ecosystem', options: any('Any ecosystem', ECOSYSTEM_FILTERS) },
    { key: 'exploited', label: 'Exploitation', options: [{ value: '', label: 'Any exploitation' }, { value: 'true', label: 'Known exploited' }] },
    { key: 'archived', label: 'Assets', options: ARCHIVED_FILTERS },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchBox
          value={query.q}
          onChange={(q) => onChange({ q })}
          label="Search matches by advisory, package or asset"
          placeholder="CVE-2021-44228, lodash, Payments API…"
          className="flex-1 basis-56"
        />
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="match-filters"
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
          aria-label="Sort matches by"
          value={query.sort || 'severity'}
          options={MATCH_SORTS.map((s) => ({ value: s.value, label: `Sort: ${s.label}` }))}
          onChange={(event) => onChange({ sort: event.target.value === 'severity' ? '' : event.target.value })}
          className="w-full sm:w-52"
        />
      </div>

      {/* Always visible from 1024px; a disclosure on smaller screens. */}
      <div id="match-filters" role="group" aria-label="Filters" className={cn('grid grid-cols-1 gap-2 xs:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6', !filtersOpen && 'max-lg:hidden')}>
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
