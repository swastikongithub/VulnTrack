/**
 * Software inventory catalog: package ecosystems, dependency vocabulary and
 * limits. The web client mirrors this file
 * (client/src/features/software/softwareCatalog.js).
 *
 * Design notes (docs/software/software-model.md):
 *  - Ecosystem values follow the naming used by the OSV schema and the
 *    Package URL (purl) spec, because those are what vulnerability sources
 *    key affected packages by. `purlType` is the purl type for the ecosystem.
 *  - `generic` covers software that isn't a registry package (nginx,
 *    PostgreSQL, an operating system). It is identified by vendor + product,
 *    which is the shape CPE-style matching will need later.
 *  - Nothing here decides how versions are compared. Each ecosystem names its
 *    version `scheme` so a later matching phase can pick the right comparator.
 */

const catalog = (entries) =>
  Object.freeze(entries.map(([value, label, extra = {}]) => Object.freeze({ value, label, ...extra })))

export const SOFTWARE_ECOSYSTEMS = catalog([
  ['npm', 'npm', { purlType: 'npm', scheme: 'semver', example: 'express or @nestjs/core' }],
  ['pypi', 'PyPI', { purlType: 'pypi', scheme: 'pep440', example: 'django' }],
  ['maven', 'Maven', { purlType: 'maven', scheme: 'maven', example: 'org.springframework:spring-core' }],
  ['nuget', 'NuGet', { purlType: 'nuget', scheme: 'nuget', example: 'Newtonsoft.Json' }],
  ['go', 'Go', { purlType: 'golang', scheme: 'go', example: 'github.com/gin-gonic/gin' }],
  ['cargo', 'crates.io', { purlType: 'cargo', scheme: 'semver', example: 'serde' }],
  ['rubygems', 'RubyGems', { purlType: 'gem', scheme: 'rubygems', example: 'rails' }],
  ['packagist', 'Packagist', { purlType: 'composer', scheme: 'composer', example: 'laravel/framework' }],
  ['generic', 'Other software', { purlType: 'generic', scheme: 'generic', example: 'nginx' }],
])

/** How the component reaches the asset. */
export const SOFTWARE_RELATIONSHIPS = catalog([
  ['direct', 'Direct'],
  ['transitive', 'Transitive'],
  ['unknown', 'Not specified'],
])

/** Where the component is used. Development-only dependencies usually carry less risk. */
export const SOFTWARE_SCOPES = catalog([
  ['runtime', 'Runtime'],
  ['development', 'Development'],
  ['unknown', 'Not specified'],
])

/**
 * Where a component record came from. Only `manual` exists today; the others
 * are reserved for manifest/SBOM import and dependency scanning.
 */
export const SOFTWARE_SOURCES = catalog([
  ['manual', 'Manual entry'],
  ['import', 'Import'],
  ['scanner', 'Dependency scan'],
])

export const SOFTWARE_LIMITS = Object.freeze({
  nameMax: 214,
  vendorMax: 100,
  /** Short enough to keep in the audit log's before/after entries. */
  versionMax: 64,
  searchMax: 100,
  pageSizeDefault: 25,
  pageSizeMax: 100,
  perAsset: 1_000,
  perOrganization: 50_000,
})

export const SOFTWARE_SORTS = Object.freeze(['name', 'ecosystem', 'updatedAt', 'createdAt'])

export const values = (entries) => entries.map((entry) => entry.value)
export const labelOf = (entries, value) => entries.find((entry) => entry.value === value)?.label ?? value
export const ecosystemOf = (value) => SOFTWARE_ECOSYSTEMS.find((entry) => entry.value === value)
