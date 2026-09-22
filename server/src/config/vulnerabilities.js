/**
 * Vulnerability intelligence catalog: internal vocabularies, provider
 * mappings and limits. The web client mirrors the display parts of this file
 * (client/src/features/vulnerabilities/vulnerabilityCatalog.js).
 *
 * Design notes (docs/vulnerabilities/vulnerability-model.md):
 *  - The catalogue is GLOBAL: public advisory data is the same for every
 *    organization, so records carry no organizationId and no organization
 *    can write to them. Only the ingestion worker writes.
 *  - One record per source advisory (nvd:CVE-…, osv:GHSA-…). Records are
 *    linked through `aliases`, never merged: real OSV advisories alias several
 *    distinct CVEs, so merging by alias would fuse different vulnerabilities.
 *  - Everything below is our own vocabulary. Adapters translate provider
 *    values (NVD vulnStatus, OSV reference types, CVSS labels…) into it, so no
 *    provider response shape leaks past services/intelligence/adapters.
 */

const catalog = (entries) =>
  Object.freeze(entries.map(([value, label, extra = {}]) => Object.freeze({ value, label, ...extra })))

export const VULNERABILITY_SOURCES = catalog([
  ['nvd', 'NVD', { name: 'National Vulnerability Database', recordUrl: (id) => `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(id)}` }],
  ['osv', 'OSV', { name: 'Open Source Vulnerabilities', recordUrl: (id) => `https://osv.dev/vulnerability/${encodeURIComponent(id)}` }],
])

/** Highest first. `rank` orders sorting; `unknown` means no usable score or label. */
export const SEVERITIES = catalog([
  ['critical', 'Critical', { rank: 5 }],
  ['high', 'High', { rank: 4 }],
  ['medium', 'Medium', { rank: 3 }],
  ['low', 'Low', { rank: 2 }],
  ['none', 'None', { rank: 1 }],
  ['unknown', 'Not rated', { rank: 0 }],
])

/**
 * Normalized lifecycle of an advisory in its source:
 *   active     published (NVD: received … analyzed/modified/deferred)
 *   rejected   NVD rejected the CVE ID (not a vulnerability, duplicate…)
 *   withdrawn  OSV withdrew the advisory
 * The source's own wording is kept alongside as `sourceStatus`.
 */
export const VULNERABILITY_STATUSES = catalog([
  ['active', 'Active'],
  ['rejected', 'Rejected'],
  ['withdrawn', 'Withdrawn'],
])

export const REFERENCE_TYPES = catalog([
  ['advisory', 'Advisory'],
  ['fix', 'Fix'],
  ['exploit', 'Exploit'],
  ['report', 'Report'],
  ['article', 'Article'],
  ['package', 'Package'],
  ['web', 'Web'],
])

/** CVSS versions we parse, newest first (also the preference order for the headline score). */
export const CVSS_VERSIONS = Object.freeze(['4.0', '3.1', '3.0', '2.0'])

/**
 * OSV ecosystem name → our software-inventory ecosystem (config/software.js).
 * Affected packages in these ecosystems get the same `componentKey` the
 * inventory uses, which is what a later matching phase will join on. Other OSV
 * ecosystems (Debian, Alpine, GitHub Actions…) are stored with `ecosystem: null`.
 */
export const OSV_ECOSYSTEMS = Object.freeze({
  npm: 'npm',
  PyPI: 'pypi',
  Maven: 'maven',
  NuGet: 'nuget',
  Go: 'go',
  'crates.io': 'cargo',
  RubyGems: 'rubygems',
  Packagist: 'packagist',
})

export const VULNERABILITY_LIMITS = Object.freeze({
  sourceIdMax: 64,
  aliasesMax: 100,
  summaryMax: 400,
  descriptionMax: 20_000,
  sourceStatusMax: 40,
  cvssMax: 20,
  vectorMax: 200,
  weaknessesMax: 50,
  referencesMax: 300,
  urlMax: 2_000,
  referenceTagsMax: 10,
  affectedPackagesMax: 200,
  packageNameMax: 214,
  rangesMax: 50,
  eventsMax: 100,
  versionMax: 128,
  /** Explicit version lists can run to thousands; beyond this they are cut and flagged. */
  versionsMax: 1_000,
  affectedProductsMax: 1_000,
  cpeMax: 300,
  searchMax: 100,
  pageSizeDefault: 25,
  pageSizeMax: 100,
  relatedMax: 20,
})

export const VULNERABILITY_SORTS = Object.freeze(['modified', 'published', 'severity', 'id'])

/**
 * Advisory identifiers we accept for lookup: CVE-2021-44228, GHSA-35jh-r3h4-6jhm,
 * PYSEC-2021-1, GO-2022-0001, RUSTSEC-2021-0001, MAL-2026-1, OSV-2020-111…
 */
export const ADVISORY_ID = /^[A-Za-z][A-Za-z0-9]{1,15}-[A-Za-z0-9][A-Za-z0-9._:-]{0,46}$/
export const CVE_ID = /^CVE-\d{4}-\d{4,}$/

export const values = (entries) => entries.map((entry) => entry.value)
export const labelOf = (entries, value) => entries.find((entry) => entry.value === value)?.label ?? value
export const severityRank = (value) => SEVERITIES.find((s) => s.value === value)?.rank ?? 0
export const sourceOf = (value) => VULNERABILITY_SOURCES.find((s) => s.value === value)
