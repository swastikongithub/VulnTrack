/**
 * Vulnerability matching vocabulary and limits (master plan §30).
 *
 * A match is a *potential* link between one installed software component and
 * one published advisory. It is not a finding: there is no workflow, owner,
 * status transition or risk score here. Findings are the next phase.
 *
 * The web client mirrors the display parts of this file
 * (client/src/features/matches/matchCatalog.js).
 */

const catalog = (entries) =>
  Object.freeze(entries.map(([value, label, extra = {}]) => Object.freeze({ value, label, ...extra })))

/**
 * What the engine concluded about a (component, advisory) pair.
 * `not_affected` is deliberately absent from storage: it is the overwhelming
 * majority of pairs and is derivable by re-running the engine.
 */
export const MATCH_STATUSES = Object.freeze({
  AFFECTED: 'affected',
  UNKNOWN_VERSION: 'unknown_version',
  UNDETERMINED: 'undetermined',
})

export const MATCH_STATUS_ENTRIES = catalog([
  ['affected', 'Affected', { description: 'The installed version falls inside a published affected range.' }],
  ['unknown_version', 'Version unknown', { description: 'The package matches, but no version is recorded, so it cannot be decided.' }],
  ['undetermined', 'Undetermined', { description: 'The package matches, but the published version data could not be evaluated.' }],
])

/**
 * How much weight the conclusion carries:
 *   high    canonical package identity + an ordered version comparison
 *   medium  identity is solid but the version could not be compared (unknown),
 *           or a vendor+product CPE equality match
 *   low     product-name-only identity, or version data that has no order
 */
export const MATCH_CONFIDENCES = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' })

export const MATCH_CONFIDENCE_ENTRIES = catalog([
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
])

/** How the two sides were connected. */
export const MATCH_ROUTES = catalog([
  ['package', 'Package identity', { description: 'Canonical ecosystem + package name (componentKey).' }],
  ['cpe', 'Vendor and product', { description: 'NVD CPE vendor/product, for software outside a package registry.' }],
])

export const MATCH_LIMITS = Object.freeze({
  searchMax: 100,
  pageSizeDefault: 25,
  pageSizeMax: 100,
  /** Safety cap on one organization's matches; a run stops and reports if exceeded. */
  perOrganization: 200_000,
  /** Components loaded per batch during a run. */
  componentBatch: 500,
  reasonMax: 600,
})

export const MATCH_SORTS = Object.freeze(['severity', 'asset', 'package', 'detected'])

export const values = (entries) => entries.map((entry) => entry.value)
export const labelOf = (entries, value) => entries.find((entry) => entry.value === value)?.label ?? value
export const statusRank = (value) => ({ affected: 3, unknown_version: 2, undetermined: 1 })[value] ?? 0
