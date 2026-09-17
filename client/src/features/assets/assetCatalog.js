/**
 * Mirror of server/src/config/assets.js (values + labels) for forms and
 * filters. API responses also carry labels, so display never depends on this
 * file being current; the server validates every value.
 */

export const ASSET_TYPES = [
  { value: 'web_application', label: 'Web application' },
  { value: 'api', label: 'API' },
  { value: 'server', label: 'Server' },
  { value: 'database', label: 'Database' },
  { value: 'container', label: 'Container' },
  { value: 'repository', label: 'Repository' },
  { value: 'cloud_resource', label: 'Cloud resource' },
  { value: 'mobile_application', label: 'Mobile application' },
  { value: 'network_device', label: 'Network device' },
  { value: 'other', label: 'Other' },
]

export const ASSET_ENVIRONMENTS = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
  { value: 'test', label: 'Test' },
  { value: 'other', label: 'Other' },
]

export const ASSET_CRITICALITIES = [
  { value: 'critical', label: 'Critical', rank: 4, hint: 'Outage or breach would be severe for the business' },
  { value: 'high', label: 'High', rank: 3, hint: 'Important system or sensitive data' },
  { value: 'medium', label: 'Medium', rank: 2, hint: 'Limited impact, contained blast radius' },
  { value: 'low', label: 'Low', rank: 1, hint: 'Little business impact' },
]

export const ASSET_EXPOSURES = [
  { value: 'internet_facing', label: 'Internet-facing' },
  { value: 'internal', label: 'Internal' },
  { value: 'unknown', label: 'Unknown' },
]

export const ASSET_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'retired', label: 'Retired' },
]

export const ASSET_STATUS_TRANSITIONS = {
  planned: ['active', 'retired'],
  active: ['deprecated', 'retired'],
  deprecated: ['active', 'retired'],
  retired: ['active'],
}

export const ASSET_IDENTIFIER_KINDS = [
  { value: 'url', label: 'URL', placeholder: 'https://api.example.com' },
  { value: 'hostname', label: 'Hostname', placeholder: 'api.example.com' },
  { value: 'ip_address', label: 'IP address', placeholder: '203.0.113.10 or 10.0.0.0/16' },
  { value: 'repository', label: 'Repository', placeholder: 'github.com/org/repo' },
  { value: 'cloud_resource_id', label: 'Cloud resource ID', placeholder: 'arn:aws:…' },
  { value: 'container_image', label: 'Container image', placeholder: 'registry.example.com/app:1.4' },
  { value: 'package', label: 'Package', placeholder: 'pkg:npm/%40org/app' },
  { value: 'other', label: 'Other', placeholder: 'Any stable identifier' },
]

export const ASSET_SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'criticality', label: 'Criticality' },
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'createdAt', label: 'Recently added' },
  { value: 'type', label: 'Type' },
  { value: 'environment', label: 'Environment' },
  { value: 'status', label: 'Lifecycle' },
]

export const ASSET_LIMITS = {
  nameMax: 120,
  descriptionMax: 2000,
  identifiersMax: 10,
  tagsMax: 20,
  tagMax: 40,
  technologiesMax: 20,
  technologyMax: 60,
  teamMax: 80,
  pageSize: 25,
}

export const TAG_PATTERN = /^[a-z0-9][a-z0-9._:/-]*$/

export const labelOf = (entries, value) => entries.find((entry) => entry.value === value)?.label ?? value
