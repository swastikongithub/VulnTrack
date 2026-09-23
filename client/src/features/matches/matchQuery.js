import { SEVERITIES } from '@/features/vulnerabilities/vulnerabilityCatalog'
import { ECOSYSTEM_FILTERS } from '@/features/vulnerabilities/vulnerabilityQuery'
import { ARCHIVED_FILTERS, MATCH_CONFIDENCES, MATCH_SORTS, MATCH_STATUSES } from './matchCatalog'

/** Registry ecosystems, shared with the catalogue filters. */
export { ECOSYSTEM_FILTERS }

/**
 * Match view state lives in the URL (?status=&severity=&…&page=), like the
 * other inventories. Unknown values are dropped here; the server validates again.
 */

const oneOf = (entries) => (value) => (entries.some((e) => e.value === value) ? value : '')

const PARSERS = {
  q: (v) => v.slice(0, 100),
  status: oneOf(MATCH_STATUSES),
  confidence: oneOf(MATCH_CONFIDENCES),
  severity: oneOf(SEVERITIES),
  ecosystem: oneOf(ECOSYSTEM_FILTERS),
  exploited: (v) => (v === 'true' ? v : ''),
  // Deep links from the asset and advisory panels.
  assetId: (v) => (/^[a-f0-9]{24}$/i.test(v) ? v : ''),
  vulnerabilityId: (v) => (/^[a-f0-9]{24}$/i.test(v) ? v : ''),
  archived: oneOf(ARCHIVED_FILTERS),
  sort: oneOf(MATCH_SORTS),
  page: (v) => (/^\d{1,4}$/.test(v) && Number(v) > 1 ? v : ''),
}

export const FILTER_KEYS = ['status', 'confidence', 'severity', 'ecosystem', 'exploited', 'archived', 'assetId', 'vulnerabilityId']

export function readMatchQuery(searchParams) {
  return Object.fromEntries(Object.entries(PARSERS).map(([key, parse]) => [key, parse(searchParams.get(key) ?? '')]))
}

export function nextMatchParams(current, changes) {
  const next = new URLSearchParams()
  const merged = { ...current, ...changes }
  if (!('page' in changes)) merged.page = ''
  for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value)
  return next
}

export const activeFilterCount = (query) => FILTER_KEYS.filter((key) => query[key]).length
