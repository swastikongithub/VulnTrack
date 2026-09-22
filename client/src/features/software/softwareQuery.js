import { SOFTWARE_ECOSYSTEMS, SOFTWARE_RELATIONSHIPS, SOFTWARE_SCOPES, SOFTWARE_SORTS, SOFTWARE_VERSION_FILTERS } from './softwareCatalog'

/**
 * Software inventory view state lives in the URL (?q=&ecosystem=&…&page=),
 * like the asset inventory. Unknown or invalid values are dropped here; the
 * server validates again.
 */

const oneOf = (entries) => (value) => (entries.some((e) => e.value === value) ? value : '')

const PARSERS = {
  q: (v) => v.slice(0, 100),
  ecosystem: oneOf(SOFTWARE_ECOSYSTEMS),
  relationship: oneOf(SOFTWARE_RELATIONSHIPS),
  scope: oneOf(SOFTWARE_SCOPES),
  version: oneOf(SOFTWARE_VERSION_FILTERS),
  sort: oneOf(SOFTWARE_SORTS),
  order: (v) => (v === 'asc' || v === 'desc' ? v : ''),
  page: (v) => (/^\d{1,4}$/.test(v) && Number(v) > 1 ? v : ''),
}

export const FILTER_KEYS = ['ecosystem', 'relationship', 'scope', 'version']

export function readSoftwareQuery(searchParams) {
  return Object.fromEntries(Object.entries(PARSERS).map(([key, parse]) => [key, parse(searchParams.get(key) ?? '')]))
}

/** New URLSearchParams with `changes` applied; any change other than `page` resets to page 1. */
export function nextSoftwareParams(current, changes) {
  const next = new URLSearchParams()
  const merged = { ...current, ...changes }
  if (!('page' in changes)) merged.page = ''
  for (const [key, value] of Object.entries(merged)) {
    if (value) next.set(key, value)
  }
  return next
}

export const activeFilterCount = (query) => FILTER_KEYS.filter((key) => query[key]).length
