import { ASSET_CRITICALITIES, ASSET_ENVIRONMENTS, ASSET_EXPOSURES, ASSET_SORTS, ASSET_STATUSES, ASSET_TYPES } from './assetCatalog'

/**
 * Inventory state lives in the URL (?q=&type=&…&page=), so filtered views are
 * shareable, survive reloads and work with back/forward. Unknown or invalid
 * values are dropped here; the server validates again.
 */

const oneOf = (entries) => (value) => (entries.some((e) => e.value === value) ? value : '')

const PARSERS = {
  q: (v) => v.slice(0, 100),
  type: oneOf(ASSET_TYPES),
  environment: oneOf(ASSET_ENVIRONMENTS),
  criticality: oneOf(ASSET_CRITICALITIES),
  exposure: oneOf(ASSET_EXPOSURES),
  status: oneOf(ASSET_STATUSES),
  tag: (v) => v.toLowerCase().slice(0, 40),
  archived: (v) => (v === 'true' ? 'true' : ''),
  sort: oneOf(ASSET_SORTS),
  order: (v) => (v === 'asc' || v === 'desc' ? v : ''),
  page: (v) => (/^\d{1,4}$/.test(v) && Number(v) > 1 ? v : ''),
}

export const FILTER_KEYS = ['type', 'environment', 'criticality', 'exposure', 'status', 'tag']

export function readInventoryQuery(searchParams) {
  return Object.fromEntries(Object.entries(PARSERS).map(([key, parse]) => [key, parse(searchParams.get(key) ?? '')]))
}

/** Returns new URLSearchParams with `changes` applied; any change other than `page` resets to page 1. */
export function nextInventoryParams(current, changes) {
  const next = new URLSearchParams()
  const merged = { ...current, ...changes }
  if (!('page' in changes)) merged.page = ''
  for (const [key, value] of Object.entries(merged)) {
    if (value) next.set(key, value)
  }
  return next
}

export function activeFilterCount(query) {
  return FILTER_KEYS.filter((key) => query[key]).length
}
