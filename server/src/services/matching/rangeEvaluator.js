import { canOrder, compareVersions } from './versionCompare.js'

/**
 * Decides whether an installed version falls inside the affected ranges a
 * source published (OSV range semantics).
 *
 * Events are read in published order:
 *   introduced    opens an interval (the literal "0" means "from the start")
 *   fixed         closes it, exclusive   → affected while version < fixed
 *   lastAffected  closes it, inclusive   → affected while version <= lastAffected
 *   limit         closes it, exclusive   (an upper bound on the range itself)
 *
 * The comparator comes from the range type: a SEMVER range is ordered by
 * SemVer rules whatever the ecosystem, an ECOSYSTEM range by the ecosystem's
 * own scheme. GIT ranges are commit graphs, not versions, and are never
 * evaluated. Anything this module cannot decide is reported as `undetermined`
 * rather than assumed safe.
 *
 * Pure and deterministic.
 */

/** Ranges whose bounds are versions we can order. */
const EVALUABLE = new Set(['SEMVER', 'ECOSYSTEM'])

const schemeFor = (rangeType, ecosystemScheme) => (rangeType === 'SEMVER' ? 'semver' : ecosystemScheme)

/** Groups ordered events into [introduced, end) intervals. */
export function intervalsOf(range) {
  const intervals = []
  let open = null
  for (const event of range.events ?? []) {
    if (event.kind === 'introduced') {
      if (open !== null) intervals.push({ introduced: open, end: null, endKind: null })
      open = event.version
    } else if (open !== null) {
      intervals.push({ introduced: open, end: event.version, endKind: event.kind })
      open = null
    }
  }
  if (open !== null) intervals.push({ introduced: open, end: null, endKind: null })
  return intervals
}

/**
 * @returns 'inside' | 'outside' | 'undetermined'
 */
function evaluateInterval(scheme, version, interval) {
  // "0" is the documented way to say "since the first release"; it needs no comparison.
  if (interval.introduced !== '0') {
    const lower = compareVersions(scheme, version, interval.introduced)
    if (lower === null) return 'undetermined'
    if (lower < 0) return 'outside'
  }
  if (interval.end === null) return 'inside' // introduced with no fix: affected from there on
  const upper = compareVersions(scheme, version, interval.end)
  if (upper === null) return 'undetermined'
  if (interval.endKind === 'lastAffected') return upper <= 0 ? 'inside' : 'outside'
  return upper < 0 ? 'inside' : 'outside' // fixed / limit are exclusive
}

/** Fixed versions a range names, for display ("Fixed in 4.17.21"). */
export const fixedVersionsOf = (ranges = []) => [
  ...new Set(ranges.filter((r) => EVALUABLE.has(r.type)).flatMap((r) => (r.events ?? []).filter((e) => e.kind === 'fixed').map((e) => e.version))),
]

/**
 * Evaluates one affected-package entry against an installed version.
 *
 * @param scheme    the ecosystem's version scheme (config/software.js)
 * @param version   the installed version, normalized (never null here)
 * @param affected  { ranges, versions } from the advisory
 * @returns { status: 'affected'|'not_affected'|'undetermined', reason }
 */
export function evaluateAffected(scheme, version, affected) {
  const ranges = affected.ranges ?? []
  const versions = affected.versions ?? []

  // An explicit version list is the strongest statement a source can make.
  for (const listed of versions) {
    if (compareVersions(scheme, version, listed) === 0) {
      return { status: 'affected', reason: { rule: 'explicit_version', version: listed } }
    }
  }

  let undetermined = null
  let skippedRange = null
  // True once a version range has been evaluated end to end: its verdict is authoritative
  // for an installed version, so an unevaluated commit range alongside it changes nothing.
  let decided = false

  for (const range of ranges) {
    if (!EVALUABLE.has(range.type)) {
      skippedRange ??= { rule: 'unevaluated_range', rangeType: range.type }
      continue
    }
    const rangeScheme = schemeFor(range.type, scheme)
    if (!canOrder(rangeScheme)) {
      undetermined ??= { rule: 'unordered_scheme', scheme: rangeScheme, rangeType: range.type }
      continue
    }
    let complete = true
    for (const interval of intervalsOf(range)) {
      const result = evaluateInterval(rangeScheme, version, interval)
      if (result === 'inside') {
        return {
          status: 'affected',
          reason: {
            rule: 'range',
            rangeType: range.type,
            scheme: rangeScheme,
            introduced: interval.introduced,
            ...(interval.end ? { end: interval.end, endKind: interval.endKind } : {}),
          },
        }
      }
      if (result === 'undetermined') {
        complete = false
        undetermined ??= { rule: 'unparsed_version', rangeType: range.type, scheme: rangeScheme, introduced: interval.introduced, ...(interval.end ? { end: interval.end } : {}) }
      }
    }
    if (complete) decided = true
  }

  // A version range that was fully evaluated settles it, even if a GIT range sits beside it.
  if (decided && !undetermined) return { status: 'not_affected', reason: { rule: 'outside_ranges' } }
  if (undetermined) return { status: 'undetermined', reason: undetermined }
  if (skippedRange) return { status: 'undetermined', reason: skippedRange }
  if (versions.length) return { status: 'not_affected', reason: { rule: 'outside_ranges' } }
  // The source names the package but publishes no version information at all.
  return { status: 'undetermined', reason: { rule: 'no_version_information' } }
}
