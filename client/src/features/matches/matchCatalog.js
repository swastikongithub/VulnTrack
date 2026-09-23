/**
 * Mirror of the display parts of server/src/config/matching.js.
 * API responses carry labels too, so display never depends on this file being
 * current; the server validates every value.
 */

export const MATCH_STATUSES = [
  { value: 'affected', label: 'Affected', hint: 'The installed version falls inside a published affected range.' },
  { value: 'unknown_version', label: 'Version unknown', hint: 'The package matches, but no version is recorded.' },
  { value: 'undetermined', label: 'Undetermined', hint: 'The published version data could not be evaluated.' },
]

export const MATCH_CONFIDENCES = [
  { value: 'high', label: 'High', hint: 'Canonical package identity and an ordered version comparison.' },
  { value: 'medium', label: 'Medium', hint: 'Identity is solid, but the version could not be compared.' },
  { value: 'low', label: 'Low', hint: 'Product-name identity, or version data with no defined order.' },
]

export const MATCH_SORTS = [
  { value: 'severity', label: 'Severity' },
  { value: 'asset', label: 'Asset' },
  { value: 'package', label: 'Package' },
  { value: 'detected', label: 'Recently detected' },
]

export const ARCHIVED_FILTERS = [
  { value: '', label: 'Live assets' },
  { value: 'true', label: 'Archived assets' },
]

export const MATCH_LIMITS = { pageSize: 25, assetPageSize: 10 }

export { labelOf } from '@/features/assets/assetCatalog'
