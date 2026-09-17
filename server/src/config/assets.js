/**
 * Asset catalog: the controlled vocabularies of the asset inventory and the
 * lifecycle rules. Values are stored; labels are for display. The web client
 * mirrors this file (client/src/features/assets/assetCatalog.js).
 *
 * Design notes (docs/assets/asset-model.md):
 *  - criticality, environment and exposure are the organizational-context
 *    inputs the future risk model needs (master plan §32); they are recorded
 *    now, but no risk score is computed in this phase;
 *  - identifiers are the join keys future scanners and software inventory
 *    will use to recognise an asset, so they are typed and normalized.
 */

const catalog = (entries) =>
  Object.freeze(entries.map(([value, label, extra = {}]) => Object.freeze({ value, label, ...extra })))

export const ASSET_TYPES = catalog([
  ['web_application', 'Web application'],
  ['api', 'API'],
  ['server', 'Server'],
  ['database', 'Database'],
  ['container', 'Container'],
  ['repository', 'Repository'],
  ['cloud_resource', 'Cloud resource'],
  ['mobile_application', 'Mobile application'],
  ['network_device', 'Network device'],
  ['other', 'Other'],
])

export const ASSET_ENVIRONMENTS = catalog([
  ['production', 'Production'],
  ['staging', 'Staging'],
  ['development', 'Development'],
  ['test', 'Test'],
  ['other', 'Other'],
])

/** `rank` orders criticality for sorting (higher = more critical). */
export const ASSET_CRITICALITIES = catalog([
  ['critical', 'Critical', { rank: 4 }],
  ['high', 'High', { rank: 3 }],
  ['medium', 'Medium', { rank: 2 }],
  ['low', 'Low', { rank: 1 }],
])

export const ASSET_EXPOSURES = catalog([
  ['internet_facing', 'Internet-facing'],
  ['internal', 'Internal'],
  ['unknown', 'Unknown'],
])

/** Lifecycle of the real-world system. Archiving (removal from the inventory) is separate. */
export const ASSET_STATUSES = catalog([
  ['planned', 'Planned'],
  ['active', 'Active'],
  ['deprecated', 'Deprecated'],
  ['retired', 'Retired'],
])

/** Allowed lifecycle transitions (from → to). Setting the current status again is a no-op. */
export const ASSET_STATUS_TRANSITIONS = Object.freeze({
  planned: Object.freeze(['active', 'retired']),
  active: Object.freeze(['deprecated', 'retired']),
  deprecated: Object.freeze(['active', 'retired']),
  retired: Object.freeze(['active']),
})

/** Statuses an asset may be created in. */
export const ASSET_INITIAL_STATUSES = Object.freeze(['planned', 'active'])

/**
 * Identifier kinds: how a scanner, import or inventory will recognise the asset.
 * Normalization per kind lives in utils/assetIdentifiers.js.
 */
export const ASSET_IDENTIFIER_KINDS = catalog([
  ['url', 'URL'],
  ['hostname', 'Hostname'],
  ['ip_address', 'IP address'],
  ['repository', 'Repository'],
  ['cloud_resource_id', 'Cloud resource ID'],
  ['container_image', 'Container image'],
  ['package', 'Package'],
  ['other', 'Other'],
])

/**
 * Where an asset record came from. Only `manual` exists today; the others are
 * reserved for import and scanning phases and can't be set through the API.
 */
export const ASSET_DISCOVERY_SOURCES = catalog([
  ['manual', 'Manual entry'],
  ['import', 'Import'],
  ['scanner', 'Scanner'],
  ['integration', 'Integration'],
])

export const ASSET_LIMITS = Object.freeze({
  nameMax: 120,
  descriptionMax: 2000,
  identifiersMax: 10,
  identifierValueMax: 512,
  tagsMax: 20,
  tagMax: 40,
  technologiesMax: 20,
  technologyMax: 60,
  teamMax: 80,
  searchMax: 100,
  pageSizeDefault: 25,
  pageSizeMax: 100,
  /** Hard cap per organization (archived included). Keeps a runaway client from filling the database. */
  perOrganization: 10_000,
})

export const ASSET_SORTS = Object.freeze(['name', 'criticality', 'type', 'environment', 'status', 'createdAt', 'updatedAt'])

export const values = (entries) => entries.map((entry) => entry.value)
export const labelOf = (entries, value) => entries.find((entry) => entry.value === value)?.label ?? value
