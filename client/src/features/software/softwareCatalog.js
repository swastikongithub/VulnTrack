/**
 * Mirror of server/src/config/software.js (values + labels) for forms,
 * filters and the Package URL preview. API responses carry labels too, so
 * display never depends on this file being current; the server validates
 * every value.
 */

export const SOFTWARE_ECOSYSTEMS = [
  { value: 'npm', label: 'npm', short: 'npm', purlType: 'npm', scheme: 'semver', namePlaceholder: 'express or @scope/name', versionPlaceholder: '4.18.2' },
  { value: 'pypi', label: 'PyPI', short: 'PyPI', purlType: 'pypi', scheme: 'pep440', namePlaceholder: 'django', versionPlaceholder: '4.2.11' },
  {
    value: 'maven',
    label: 'Maven',
    short: 'MVN',
    purlType: 'maven',
    scheme: 'maven',
    namePlaceholder: 'org.springframework:spring-core',
    versionPlaceholder: '6.1.4',
  },
  { value: 'nuget', label: 'NuGet', short: 'NuGet', purlType: 'nuget', scheme: 'nuget', namePlaceholder: 'Newtonsoft.Json', versionPlaceholder: '13.0.3' },
  { value: 'go', label: 'Go', short: 'Go', purlType: 'golang', scheme: 'go', namePlaceholder: 'github.com/gin-gonic/gin', versionPlaceholder: 'v1.9.1' },
  { value: 'cargo', label: 'crates.io', short: 'Crate', purlType: 'cargo', scheme: 'semver', namePlaceholder: 'serde', versionPlaceholder: '1.0.197' },
  { value: 'rubygems', label: 'RubyGems', short: 'Gem', purlType: 'gem', scheme: 'rubygems', namePlaceholder: 'rails', versionPlaceholder: '7.1.3' },
  {
    value: 'packagist',
    label: 'Packagist',
    short: 'PHP',
    purlType: 'composer',
    scheme: 'composer',
    namePlaceholder: 'laravel/framework',
    versionPlaceholder: '10.48.4',
  },
  { value: 'generic', label: 'Other software', short: 'SW', purlType: 'generic', scheme: 'generic', namePlaceholder: 'nginx', versionPlaceholder: '1.25.4' },
]

export const SOFTWARE_RELATIONSHIPS = [
  { value: 'direct', label: 'Direct' },
  { value: 'transitive', label: 'Transitive' },
  { value: 'unknown', label: 'Not specified' },
]

export const SOFTWARE_SCOPES = [
  { value: 'runtime', label: 'Runtime' },
  { value: 'development', label: 'Development' },
  { value: 'unknown', label: 'Not specified' },
]

export const SOFTWARE_VERSION_FILTERS = [
  { value: 'known', label: 'Version known' },
  { value: 'unknown', label: 'Version unknown' },
]

export const SOFTWARE_SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'ecosystem', label: 'Ecosystem' },
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'createdAt', label: 'Recently added' },
]

export const SOFTWARE_LIMITS = {
  nameMax: 214,
  vendorMax: 100,
  versionMax: 64,
  pageSize: 25,
  /** The asset page shows up to this many components per page. */
  assetPageSize: 50,
}

export const ecosystemOf = (value) => SOFTWARE_ECOSYSTEMS.find((entry) => entry.value === value)
export { labelOf } from '@/features/assets/assetCatalog'

/** "Direct · Runtime", omitting parts that weren't specified. */
export function usageText(component) {
  const parts = []
  if (component.relationship !== 'unknown') parts.push(component.relationshipLabel)
  if (component.scope !== 'unknown') parts.push(component.scopeLabel)
  return parts.length ? parts.join(' · ') : 'Not specified'
}
