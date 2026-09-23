/**
 * Scheme-aware version comparison.
 *
 * Every ecosystem in config/software.js names a version `scheme`; this module
 * implements one comparator per scheme, following each ecosystem's own
 * specification. Versions are NEVER compared as strings: "1.10.0" is greater
 * than "1.9.0", "1.0.0-rc.1" is less than "1.0.0", and Maven's "1.0-SNAPSHOT"
 * is less than "1.0".
 *
 * Pure and deterministic: no database, no clock, no I/O. Each comparator
 * returns -1, 0 or 1, or `null` when a value cannot be parsed under the
 * scheme. `null` is never treated as "equal" or "outside a range" by callers —
 * it makes a match undetermined, which is reported rather than hidden.
 */

/** Schemes whose versions have a defined order. `generic` versions are opaque labels. */
export const ORDERED_SCHEMES = Object.freeze(['semver', 'go', 'pep440', 'maven', 'nuget', 'composer', 'rubygems'])

export const canOrder = (scheme) => ORDERED_SCHEMES.includes(scheme)

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const isDigits = (value) => /^\d+$/.test(value)

/** Compares dot-separated prerelease identifiers (SemVer §11.4, also used by NuGet). */
function comparePrereleaseIds(a, b, { caseInsensitive = false } = {}) {
  const left = a.split('.')
  const right = b.split('.')
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i]
    const y = right[i]
    if (x === undefined) return -1 // a shorter set of identifiers is lower
    if (y === undefined) return 1
    const xNum = isDigits(x)
    const yNum = isDigits(y)
    if (xNum && yNum) {
      const result = cmp(Number(x), Number(y))
      if (result) return result
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1 // numeric identifiers are lower than alphanumeric ones
    } else {
      const result = cmp(caseInsensitive ? x.toLowerCase() : x, caseInsensitive ? y.toLowerCase() : y)
      if (result) return result
    }
  }
  return 0
}

// ── SemVer (npm, crates.io) and Go ───────────────────────────────────────────

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parseSemver(value) {
  const match = SEMVER.exec(String(value).trim().replace(/^[v=]/i, ''))
  if (!match) return null
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] ?? null }
}

function compareSemver(a, b) {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (!left || !right) return null
  for (let i = 0; i < 3; i++) {
    const result = cmp(left.parts[i], right.parts[i])
    if (result) return result
  }
  if (left.prerelease === right.prerelease) return 0
  // A version with a prerelease is lower than the same version without one.
  if (left.prerelease === null) return 1
  if (right.prerelease === null) return -1
  return comparePrereleaseIds(left.prerelease, right.prerelease)
}

// ── PEP 440 (PyPI) ───────────────────────────────────────────────────────────

const PEP440 =
  /^v?(?:(\d+)!)?(\d+(?:\.\d+)*)(?:[-_.]?(a|b|c|rc|alpha|beta|pre|preview)[-_.]?(\d*))?(?:(?:-(\d+))|(?:[-_.]?(post|rev|r)[-_.]?(\d*)))?(?:[-_.]?(dev)[-_.]?(\d*))?(?:\+([a-z0-9]+(?:[-_.][a-z0-9]+)*))?$/i

const PRE_ALIASES = { alpha: 'a', beta: 'b', c: 'rc', pre: 'rc', preview: 'rc' }
/** Sentinels: a missing segment sorts below or above everything, per PEP 440's comparison key. */
const LOWEST = { lowest: true }
const HIGHEST = { highest: true }

function parsePep440(value) {
  const match = PEP440.exec(String(value).trim())
  if (!match) return null
  const [, epoch, release, preLabel, preNumber, implicitPost, postLabel, postNumber, dev, devNumber, local] = match

  let pre = preLabel ? [PRE_ALIASES[preLabel.toLowerCase()] ?? preLabel.toLowerCase(), Number(preNumber || 0)] : null
  let post = implicitPost !== undefined ? Number(implicitPost) : postLabel ? Number(postNumber || 0) : null
  const devSegment = dev ? Number(devNumber || 0) : null

  // PEP 440 comparison key: a dev release without pre/post sorts below the release.
  if (pre === null && post === null && devSegment !== null) pre = LOWEST
  else if (pre === null) pre = HIGHEST
  if (post === null) post = LOWEST

  return {
    epoch: Number(epoch || 0),
    release: release.split('.').map(Number),
    pre,
    post,
    dev: devSegment === null ? HIGHEST : devSegment,
    local: local ? local.toLowerCase().split(/[-_.]/) : null,
  }
}

function compareSentinel(a, b) {
  if (a === b) return 0
  if (a === LOWEST) return -1
  if (b === LOWEST) return 1
  if (a === HIGHEST) return 1
  if (b === HIGHEST) return -1
  return null
}

function compareSegment(a, b) {
  const sentinel = compareSentinel(a, b)
  if (sentinel !== null) return sentinel
  if (Array.isArray(a) && Array.isArray(b)) {
    const label = cmp(a[0], b[0])
    return label || cmp(a[1], b[1])
  }
  return cmp(a, b)
}

/** Release segments compare element-wise with implicit trailing zeros: 1.0 == 1.0.0. */
function compareRelease(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const result = cmp(a[i] ?? 0, b[i] ?? 0)
    if (result) return result
  }
  return 0
}

function compareLocal(a, b) {
  if (a === null && b === null) return 0
  if (a === null) return -1 // a version without a local segment is lower
  if (b === null) return 1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNum = isDigits(x)
    const yNum = isDigits(y)
    if (xNum && yNum) {
      const result = cmp(Number(x), Number(y))
      if (result) return result
    } else if (xNum !== yNum) {
      return xNum ? 1 : -1 // numeric local segments are higher than alphabetic ones
    } else {
      const result = cmp(x, y)
      if (result) return result
    }
  }
  return 0
}

function comparePep440(a, b) {
  const left = parsePep440(a)
  const right = parsePep440(b)
  if (!left || !right) return null
  return (
    cmp(left.epoch, right.epoch) ||
    compareRelease(left.release, right.release) ||
    compareSegment(left.pre, right.pre) ||
    compareSegment(left.post, right.post) ||
    compareSegment(left.dev, right.dev) ||
    compareLocal(left.local, right.local)
  )
}

// ── Maven (ComparableVersion) ────────────────────────────────────────────────

/** Qualifier order from Maven's ComparableVersion; "" is the release itself. */
const MAVEN_QUALIFIERS = ['alpha', 'beta', 'milestone', 'rc', 'snapshot', '', 'sp']
const MAVEN_ALIASES = { a: 'alpha', b: 'beta', m: 'milestone', cr: 'rc', ga: '', final: '', release: '', latest: '' }

/** Splits a Maven version into nested items: "-" starts a sub-list, "." continues the current one. */
function parseMaven(value) {
  const text = String(value).trim().toLowerCase()
  if (!text) return null
  const root = []
  let list = root
  const stack = [root]
  let token = ''
  let previousWasDigit = null

  const push = () => {
    if (token === '') {
      list.push({ type: 'string', value: '' })
      return
    }
    list.push(isDigits(token) ? { type: 'number', value: Number(token) } : { type: 'string', value: MAVEN_ALIASES[token] ?? token })
    token = ''
  }

  for (const char of text) {
    if (char === '.') {
      push()
      previousWasDigit = null
    } else if (char === '-') {
      push()
      const sub = []
      list.push({ type: 'list', value: sub })
      stack.push(sub)
      list = sub
      previousWasDigit = null
    } else {
      const digit = /\d/.test(char)
      // A digit/letter transition also separates items ("1.0alpha1" → 1, 0, alpha, 1).
      if (previousWasDigit !== null && digit !== previousWasDigit && token !== '') push()
      previousWasDigit = digit
      token += char
    }
  }
  push()
  void stack
  return root
}

const mavenQualifierRank = (value) => {
  const index = MAVEN_QUALIFIERS.indexOf(value)
  return index === -1 ? null : index
}

/** Compares one item against "null" (an absent item), i.e. the release baseline. */
function compareMavenToNull(item) {
  if (item.type === 'number') return item.value === 0 ? 0 : 1
  if (item.type === 'list') return compareMavenLists(item.value, [])
  const rank = mavenQualifierRank(item.value)
  if (rank === null) return 1 // unknown qualifiers sort after the release
  return cmp(rank, MAVEN_QUALIFIERS.indexOf(''))
}

/** Type precedence from ComparableVersion: number > list > qualifier. */
function compareMavenItems(a, b) {
  if (a.type === b.type) {
    if (a.type === 'number') return cmp(a.value, b.value)
    if (a.type === 'list') return compareMavenLists(a.value, b.value)
    const rankA = mavenQualifierRank(a.value)
    const rankB = mavenQualifierRank(b.value)
    if (rankA !== null && rankB !== null) return cmp(rankA, rankB)
    if (rankA === null && rankB === null) return cmp(a.value, b.value)
    // A known qualifier compares to an unknown one by its position relative to the release.
    return rankA === null ? 1 : -1
  }
  if (a.type === 'number') return 1
  if (b.type === 'number') return -1
  return a.type === 'list' ? 1 : -1
}

function compareMavenLists(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) {
      const result = -compareMavenToNull(y)
      if (result) return result
      continue
    }
    if (y === undefined) {
      const result = compareMavenToNull(x)
      if (result) return result
      continue
    }
    const result = compareMavenItems(x, y)
    if (result) return result
  }
  return 0
}

function compareMaven(a, b) {
  const left = parseMaven(a)
  const right = parseMaven(b)
  if (!left || !right) return null
  return compareMavenLists(left, right)
}

// ── NuGet ────────────────────────────────────────────────────────────────────

const NUGET = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function compareNuget(a, b) {
  const left = NUGET.exec(String(a).trim())
  const right = NUGET.exec(String(b).trim())
  if (!left || !right) return null
  for (let i = 1; i <= 4; i++) {
    const result = cmp(Number(left[i] ?? 0), Number(right[i] ?? 0))
    if (result) return result
  }
  const preA = left[5] ?? null
  const preB = right[5] ?? null
  if (preA === preB) return 0
  if (preA === null) return 1
  if (preB === null) return -1
  return comparePrereleaseIds(preA, preB, { caseInsensitive: true })
}

// ── Composer (Packagist) ─────────────────────────────────────────────────────

const COMPOSER_STABILITY = { dev: 0, alpha: 1, a: 1, beta: 2, b: 2, rc: 3, '': 4, stable: 4, pl: 5, p: 5 }
const COMPOSER = /^v?(\d+(?:\.\d+)*)(?:[-_.]?(dev|alpha|a|beta|b|rc|stable|pl|p)[-_.]?(\d*))?(?:\+[0-9A-Za-z.-]+)?$/i

function compareComposer(a, b) {
  const left = COMPOSER.exec(String(a).trim())
  const right = COMPOSER.exec(String(b).trim())
  if (!left || !right) return null
  const release = compareRelease(left[1].split('.').map(Number), right[1].split('.').map(Number))
  if (release) return release
  const stabilityA = COMPOSER_STABILITY[(left[2] ?? '').toLowerCase()]
  const stabilityB = COMPOSER_STABILITY[(right[2] ?? '').toLowerCase()]
  return cmp(stabilityA, stabilityB) || cmp(Number(left[3] || 0), Number(right[3] || 0))
}

// ── RubyGems (Gem::Version) ──────────────────────────────────────────────────

/** Segments split on "." and on digit/letter boundaries: "1.0.0.beta1" → [1,0,0,'beta',1]. */
function parseRubygems(value) {
  const text = String(value).trim().replace(/^v/i, '')
  if (!/^[0-9]/.test(text)) return null
  const segments = []
  for (const part of text.split('.')) {
    const tokens = part.match(/\d+|[A-Za-z]+|-/g)
    if (!tokens) return null
    for (const token of tokens) segments.push(isDigits(token) ? Number(token) : token.toLowerCase())
  }
  return segments
}

function compareRubygems(a, b) {
  const left = parseRubygems(a)
  const right = parseRubygems(b)
  if (!left || !right) return null
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    // Missing segments are 0, so 1.0 == 1.0.0; but a letter segment makes it a prerelease.
    const x = left[i] ?? 0
    const y = right[i] ?? 0
    if (typeof x === typeof y) {
      const result = cmp(x, y)
      if (result) return result
    } else {
      // A string segment is lower than a numeric one: 1.0.a < 1.0 < 1.0.1
      return typeof x === 'string' ? -1 : 1
    }
  }
  return 0
}

// ── Public API ───────────────────────────────────────────────────────────────

const COMPARATORS = {
  semver: compareSemver,
  go: compareSemver, // Go module versions are SemVer with a "v" prefix
  pep440: comparePep440,
  maven: compareMaven,
  nuget: compareNuget,
  composer: compareComposer,
  rubygems: compareRubygems,
}

/**
 * Compares two versions under a scheme.
 * @returns -1 | 0 | 1, or null when either value can't be parsed (or the
 *          scheme has no order, e.g. `generic`, and the values differ).
 */
export function compareVersions(scheme, a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return null
  if (!canOrder(scheme)) return a.trim() === b.trim() ? 0 : null
  return COMPARATORS[scheme]?.(a, b) ?? null
}

/** True when both versions parse under the scheme (so a range decision is possible). */
export const comparable = (scheme, a, b) => compareVersions(scheme, a, b) !== null

/** Exported for tests: the per-scheme parsers decide what "valid" means. */
export const parsers = { parseSemver, parsePep440, parseMaven, parseRubygems }
