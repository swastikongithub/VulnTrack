import { ecosystemOf } from '../config/software.js'
import { hasControlCharacters } from './text.js'

/**
 * Software component identity: validates a package name and version for its
 * ecosystem, then derives the canonical forms later matching will key on.
 *
 *   componentKey  `${ecosystem}:${normalized name}`: the package, any version
 *   version       the version as normalized for its ecosystem (or null: unknown)
 *   purl          Package URL (github.com/package-url/purl-spec), the identity
 *                 SBOMs and the OSV schema use
 *
 * Normalization only removes differences the ecosystem itself treats as
 * irrelevant (PyPI's case and separators, npm's case, a `v` prefix on SemVer…).
 * It never guesses: a value that doesn't fit the ecosystem's rules is rejected
 * with a field message. Nothing here compares versions; that belongs to the
 * matching phase, which gets the ecosystem's version scheme from
 * config/software.js.
 */

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
/** PEP 440 public/local version (spec appendix B), case-insensitive, optional leading "v". */
const PEP440 =
  /^v?(?:(?:[0-9]+!)?[0-9]+(?:\.[0-9]+)*(?:[-_.]?(?:alpha|a|beta|b|preview|pre|c|rc)[-_.]?[0-9]*)?(?:-[0-9]+|[-_.]?(?:post|rev|r)[-_.]?[0-9]*)?(?:[-_.]?dev[-_.]?[0-9]*)?)(?:\+[a-z0-9]+(?:[-_.][a-z0-9]+)*)?$/i
/** Version token for ecosystems with free-form versions (Maven, NuGet, RubyGems, Composer, other software). */
const VERSION_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._+~:-]*$/

const NPM = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const PYPI = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i
const MAVEN = /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/
const NUGET = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
const GO = /^[a-z0-9.-]+\.[a-z]{2,}(?:\/[A-Za-z0-9._~+-]+)+$/
const CARGO = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const GEM = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const COMPOSER = /^[a-z0-9](?:[_.-]?[a-z0-9]+)*\/[a-z0-9](?:(?:[_.]|-{1,2})?[a-z0-9]+)*$/

const collapse = (text) => text.trim().replace(/\s+/g, ' ')
const lastSlash = (path) => {
  const i = path.lastIndexOf('/')
  return i === -1 ? { namespace: null, name: path } : { namespace: path.slice(0, i), name: path.slice(i + 1) }
}

/** Per ecosystem: raw name → { key, namespace, name } (purl parts) or { error }. */
const NAMES = {
  npm(raw) {
    const lower = raw.toLowerCase()
    if (!NPM.test(lower)) return { error: 'Enter an npm package name, like express or @scope/name' }
    const { namespace, name } = lastSlash(lower)
    return { key: lower, namespace, name }
  },
  pypi(raw) {
    if (!PYPI.test(raw)) return { error: 'Enter a PyPI project name, like django' }
    // PEP 503: case-insensitive, runs of "-", "_" and "." are equivalent.
    const key = raw.toLowerCase().replace(/[-_.]+/g, '-')
    return { key, namespace: null, name: key }
  },
  maven(raw) {
    if (!MAVEN.test(raw)) return { error: 'Use groupId:artifactId, like org.springframework:spring-core' }
    const [group, artifact] = raw.split(':')
    return { key: raw, namespace: group, name: artifact }
  },
  nuget(raw) {
    if (!NUGET.test(raw)) return { error: 'Enter a NuGet package ID, like Newtonsoft.Json' }
    // NuGet package IDs are case-insensitive.
    const key = raw.toLowerCase()
    return { key, namespace: null, name: key }
  },
  go(raw) {
    if (raw === 'stdlib') return { key: 'stdlib', namespace: null, name: 'stdlib' }
    const [host, ...rest] = raw.split('/')
    const path = [host.toLowerCase(), ...rest].join('/')
    if (!GO.test(path)) return { error: 'Enter a Go module path, like github.com/gin-gonic/gin' }
    return { key: path, ...lastSlash(path) }
  },
  cargo(raw) {
    if (!CARGO.test(raw)) return { error: 'Enter a crate name, like serde' }
    // crates.io treats "-" and "_" (and case) as the same crate.
    const key = raw.toLowerCase().replace(/_/g, '-')
    return { key, namespace: null, name: key }
  },
  rubygems(raw) {
    if (!GEM.test(raw)) return { error: 'Enter a gem name, like rails' }
    return { key: raw, namespace: null, name: raw }
  },
  packagist(raw) {
    const lower = raw.toLowerCase()
    if (!COMPOSER.test(lower)) return { error: 'Use vendor/package, like laravel/framework' }
    return { key: lower, ...lastSlash(lower) }
  },
  generic(raw, vendor) {
    if (raw.length > 120) return { error: 'Use 120 characters or fewer' }
    const name = collapse(raw).toLowerCase()
    const namespace = vendor ? collapse(vendor).toLowerCase() : null
    return { key: namespace ? `${namespace}/${name}` : name, namespace, name }
  },
}

function semver(raw, { prefix = '' } = {}) {
  const bare = raw.replace(/^[v=]/i, '')
  if (!SEMVER.test(bare)) return { error: 'Use a SemVer version, like 1.4.2' }
  return { version: `${prefix}${bare}` }
}

function token(raw, { lower = false, stripV = false } = {}) {
  if (!VERSION_TOKEN.test(raw)) return { error: 'Use letters, numbers and . - + ~ : only' }
  let version = stripV && /^v\d/i.test(raw) ? raw.slice(1) : raw
  if (lower) version = version.toLowerCase()
  return { version }
}

/** Per version scheme: raw version → { version } or { error }. */
const VERSIONS = {
  semver: (raw) => semver(raw),
  // Go module versions always carry the "v" prefix (v1.9.1, v0.0.0-2021…-abcdef).
  go: (raw) => semver(raw, { prefix: 'v' }),
  pep440: (raw) => (PEP440.test(raw) ? { version: raw.replace(/^v/i, '').toLowerCase() } : { error: 'Use a PEP 440 version, like 4.2.1' }),
  nuget: (raw) => token(raw, { lower: true }),
  composer: (raw) => token(raw, { lower: true, stripV: true }),
  maven: (raw) => token(raw),
  rubygems: (raw) => token(raw),
  generic: (raw) => token(raw),
}

const encode = (segment) => encodeURIComponent(segment)

/** pkg:type/namespace/name@version: each segment percent-encoded (namespace segments separately). */
export function buildPurl(ecosystem, { namespace, name }, version) {
  const type = ecosystemOf(ecosystem).purlType
  const ns = namespace ? `${namespace.split('/').map(encode).join('/')}/` : ''
  return `pkg:${type}/${ns}${encode(name)}${version ? `@${encode(version)}` : ''}`
}

/**
 * Validates and normalizes a component's identity.
 * @returns {{ fields: object } | { name, vendor, componentKey, version, versionNormalized, purl }}
 */
export function normalizeComponent({ ecosystem, name, vendor, version }) {
  const fields = {}
  const entry = ecosystemOf(ecosystem)
  if (!entry) return { fields: { ecosystem: 'Choose an ecosystem' } }

  const rawName = String(name ?? '').trim()
  const rawVendor = ecosystem === 'generic' ? String(vendor ?? '').trim() : ''
  const rawVersion = String(version ?? '').trim()

  if (vendor && ecosystem !== 'generic' && String(vendor).trim()) fields.vendor = 'Vendor applies to other software only'
  if (hasControlCharacters(rawVendor)) fields.vendor = 'Remove control characters'

  let identity = null
  if (!rawName) fields.name = 'Enter the package name'
  else if (hasControlCharacters(rawName)) fields.name = 'Remove control characters'
  else {
    identity = NAMES[ecosystem](rawName, rawVendor)
    if (identity.error) fields.name = identity.error
  }

  let versionNormalized = null
  if (rawVersion) {
    const result = VERSIONS[entry.scheme](rawVersion)
    if (result.error) fields.version = result.error
    else versionNormalized = result.version
  }

  if (Object.keys(fields).length) return { fields }
  return {
    name: rawName,
    vendor: rawVendor || null,
    componentKey: `${ecosystem}:${identity.key}`,
    version: rawVersion || null,
    versionNormalized,
    purl: buildPurl(ecosystem, identity, versionNormalized),
  }
}
