import { describe, expect, it } from 'vitest'
import { normalizeOsvRecord } from '../src/services/intelligence/adapters/osvAdapter.js'
import { evaluateMatch } from '../src/services/matching/matchEngine.js'
import { evaluateAffected, intervalsOf } from '../src/services/matching/rangeEvaluator.js'
import { normalizeComponent } from '../src/utils/softwareIdentity.js'
import { fixture } from './support/intelligence.js'

/** A component as the inventory stores it (identity derived by the same code the API uses). */
const component = (ecosystem, name, version, vendor = '') => {
  const identity = normalizeComponent({ ecosystem, name, vendor, version })
  if (identity.fields) throw new Error(`bad test component: ${JSON.stringify(identity.fields)}`)
  return { ecosystem, name: identity.name, vendor: identity.vendor, componentKey: identity.componentKey, version: identity.version, versionNormalized: identity.versionNormalized }
}

/** An advisory in the normalized shape, built from a real OSV record. */
const advisory = (name) => {
  const result = normalizeOsvRecord(fixture(name))
  if (!result.ok) throw new Error(result.message)
  return result.advisory
}

const range = (type, ...events) => ({ type, events })
const affectedPackage = (componentKey, ranges = [], versions = []) => ({ componentKey, name: componentKey.split(':')[1], ecosystem: componentKey.split(':')[0], ranges, versions })

describe('affected-range evaluation', () => {
  const semver = (...events) => [range('SEMVER', ...events)]

  it('reads events in order into intervals', () => {
    expect(intervalsOf(range('SEMVER', { kind: 'introduced', version: '0' }, { kind: 'fixed', version: '1.2.0' }, { kind: 'introduced', version: '2.0.0' }))).toEqual([
      { introduced: '0', end: '1.2.0', endKind: 'fixed' },
      { introduced: '2.0.0', end: null, endKind: null },
    ])
  })

  it('treats "fixed" as exclusive and "lastAffected" as inclusive', () => {
    const fixed = { ranges: semver({ kind: 'introduced', version: '0' }, { kind: 'fixed', version: '4.17.21' }) }
    expect(evaluateAffected('semver', '4.17.20', fixed).status).toBe('affected')
    expect(evaluateAffected('semver', '4.17.21', fixed).status).toBe('not_affected')
    expect(evaluateAffected('semver', '4.18.0', fixed).status).toBe('not_affected')

    const last = { ranges: semver({ kind: 'introduced', version: '0' }, { kind: 'lastAffected', version: '4.5.0' }) }
    expect(evaluateAffected('semver', '4.5.0', last).status).toBe('affected')
    expect(evaluateAffected('semver', '4.5.1', last).status).toBe('not_affected')
  })

  it('honours the lower bound and open-ended ranges', () => {
    const introduced = { ranges: semver({ kind: 'introduced', version: '3.7.0' }, { kind: 'fixed', version: '4.17.19' }) }
    expect(evaluateAffected('semver', '3.6.0', introduced).status).toBe('not_affected')
    expect(evaluateAffected('semver', '3.7.0', introduced).status).toBe('affected')

    const noFix = { ranges: semver({ kind: 'introduced', version: '2.0.0' }) }
    expect(evaluateAffected('semver', '9.9.9', noFix)).toMatchObject({ status: 'affected', reason: { rule: 'range', introduced: '2.0.0' } })
    expect(evaluateAffected('semver', '1.0.0', noFix).status).toBe('not_affected')
  })

  it('handles several disjoint intervals in one range', () => {
    const multi = {
      ranges: semver(
        { kind: 'introduced', version: '0' },
        { kind: 'fixed', version: '1.2.0' },
        { kind: 'introduced', version: '2.0.0' },
        { kind: 'fixed', version: '2.3.0' },
      ),
    }
    expect(['1.1.0', '2.2.0'].map((v) => evaluateAffected('semver', v, multi).status)).toEqual(['affected', 'affected'])
    expect(['1.2.0', '2.3.0', '3.0.0'].map((v) => evaluateAffected('semver', v, multi).status)).toEqual(['not_affected', 'not_affected', 'not_affected'])
  })

  it('matches an explicit affected-version list exactly', () => {
    const listed = { versions: ['4.2.1', '4.2.2'] }
    expect(evaluateAffected('pep440', '4.2.1', listed)).toMatchObject({ status: 'affected', reason: { rule: 'explicit_version', version: '4.2.1' } })
    expect(evaluateAffected('pep440', '4.2.3', listed).status).toBe('not_affected')
    // Equality is scheme-aware, not string equality.
    expect(evaluateAffected('pep440', '4.2.1.0', listed).status).toBe('affected')
  })

  it('reports what it cannot decide instead of assuming safety', () => {
    const git = { ranges: [range('GIT', { kind: 'introduced', version: 'abcdef1234' }, { kind: 'fixed', version: '1234abcdef' })] }
    expect(evaluateAffected('semver', '1.0.0', git)).toMatchObject({ status: 'undetermined', reason: { rule: 'unevaluated_range', rangeType: 'GIT' } })

    const unparseable = { ranges: [range('ECOSYSTEM', { kind: 'introduced', version: '0' }, { kind: 'fixed', version: 'not-a-version' })] }
    expect(evaluateAffected('semver', '1.0.0', unparseable)).toMatchObject({ status: 'undetermined', reason: { rule: 'unparsed_version' } })

    const unordered = { ranges: [range('ECOSYSTEM', { kind: 'introduced', version: '0' }, { kind: 'fixed', version: '1.2' })] }
    expect(evaluateAffected('generic', '1.1', unordered)).toMatchObject({ status: 'undetermined', reason: { rule: 'unordered_scheme' } })

    expect(evaluateAffected('semver', '1.0.0', {})).toMatchObject({ status: 'undetermined', reason: { rule: 'no_version_information' } })
  })

  it('prefers a decision over an undecidable range in the same advisory', () => {
    const mixed = {
      ranges: [range('GIT', { kind: 'introduced', version: 'abc' }), range('SEMVER', { kind: 'introduced', version: '0' }, { kind: 'fixed', version: '2.0.0' })],
    }
    expect(evaluateAffected('semver', '1.0.0', mixed).status).toBe('affected')
    // A fully evaluated version range settles it; the commit range beside it (which OSV records
    // almost always carry) does not make a released version undecidable.
    expect(evaluateAffected('semver', '2.0.1', mixed).status).toBe('not_affected')
    // But an unparseable bound in the version range itself still counts as uncertainty.
    const broken = { ranges: [range('GIT', { kind: 'introduced', version: 'abc' }), range('SEMVER', { kind: 'introduced', version: '0' }, { kind: 'fixed', version: 'oops' })] }
    expect(evaluateAffected('semver', '2.0.1', broken).status).toBe('undetermined')
  })
})

describe('match engine', () => {
  const lodashAdvisory = advisory('osv-GHSA-35jh-r3h4-6jhm.json') // lodash < 4.17.21

  it('matches a vulnerable installed version through canonical package identity', () => {
    const outcome = evaluateMatch(component('npm', 'Lodash', '4.17.15'), lodashAdvisory)
    expect(outcome).toMatchObject({
      status: 'affected',
      confidence: 'high',
      via: 'package',
      package: 'lodash',
      reason: { rule: 'range', rangeType: 'SEMVER', introduced: '0', end: '4.17.21', endKind: 'fixed' },
    })
    expect(outcome.fixedVersions).toContain('4.17.21')
  })

  it('does not match a fixed version', () => {
    expect(evaluateMatch(component('npm', 'lodash', '4.17.21'), lodashAdvisory)).toBeNull()
    expect(evaluateMatch(component('npm', 'lodash', '5.0.0'), lodashAdvisory)).toBeNull()
  })

  it('reports an unknown version instead of guessing either way', () => {
    expect(evaluateMatch(component('npm', 'lodash', ''), lodashAdvisory)).toMatchObject({
      status: 'unknown_version',
      confidence: 'medium',
      reason: { rule: 'version_unknown' },
    })
  })

  it('ignores advisories about other packages', () => {
    expect(evaluateMatch(component('npm', 'express', '4.18.2'), lodashAdvisory)).toBeNull()
    // Same name, different ecosystem: componentKey keeps them apart.
    expect(evaluateMatch(component('pypi', 'lodash', '4.17.15'), lodashAdvisory)).toBeNull()
  })

  it('evaluates each installed version of the same package independently', () => {
    const outcomes = ['4.17.15', '4.17.21'].map((version) => evaluateMatch(component('npm', 'lodash', version), lodashAdvisory))
    expect(outcomes.map((o) => o?.status ?? 'none')).toEqual(['affected', 'none'])
  })

  it('normalizes names before matching (PyPI separators, npm case)', () => {
    const pysec = advisory('osv-PYSEC-2021-19.json') // lxml
    expect(evaluateMatch(component('pypi', 'LXML', '4.6.2'), pysec)).toMatchObject({ status: 'affected', via: 'package' })
    expect(evaluateMatch(component('pypi', 'lxml', '4.6.3'), pysec)).toBeNull()
  })

  it('matches other software through NVD CPE vendor and product', () => {
    const nvd = {
      affectedPackages: [],
      affectedProducts: [
        { cpe: 'cpe:2.3:a:f5:nginx:1.25.3:*:*:*:*:*:*:*', part: 'a', vendor: 'f5', product: 'nginx', version: '1.25.3' },
        { cpe: 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*', part: 'a', vendor: 'openssl', product: 'openssl', version: '*', versionEndExcluding: '3.0.13' },
        { cpe: 'cpe:2.3:o:microsoft:windows_server:*:*:*:*:*:*:*:*', part: 'o', vendor: 'microsoft', product: 'windows_server', version: '*' },
      ],
    }
    expect(evaluateMatch(component('generic', 'nginx', '1.25.3', 'F5'), nvd)).toMatchObject({ status: 'affected', confidence: 'medium', via: 'cpe', reason: { rule: 'cpe_version' } })
    expect(evaluateMatch(component('generic', 'nginx', '1.24.0', 'F5'), nvd)).toBeNull()
    // A CPE version range can't be evaluated: "other software" versions have no order.
    expect(evaluateMatch(component('generic', 'OpenSSL', '3.0.1', 'OpenSSL'), nvd)).toMatchObject({ status: 'undetermined', confidence: 'low', reason: { rule: 'cpe_unordered_range' } })
    // "*" with no bounds means every version of the product.
    expect(evaluateMatch(component('generic', 'Windows Server', '2019'), nvd)).toMatchObject({ status: 'affected', confidence: 'low', reason: { rule: 'cpe_any_version' } })
    // A different vendor for the same product name is not a match.
    expect(evaluateMatch(component('generic', 'nginx', '1.25.3', 'Acme'), nvd)).toBeNull()
  })

  it('does not use the CPE route for registry packages', () => {
    const nvd = { affectedPackages: [], affectedProducts: [{ cpe: 'cpe:2.3:a:lodash:lodash:*:*:*:*:*:*:*:*', part: 'a', vendor: 'lodash', product: 'lodash', version: '*' }] }
    expect(evaluateMatch(component('npm', 'lodash', '4.17.15'), nvd)).toBeNull()
  })

  it('is deterministic: the same inputs give the same outcome', () => {
    const input = component('npm', 'lodash', '4.17.15')
    const first = evaluateMatch(input, lodashAdvisory)
    for (let i = 0; i < 5; i++) expect(evaluateMatch(input, lodashAdvisory)).toEqual(first)
  })

  it('takes the strongest outcome when an advisory lists a package more than once', () => {
    const both = {
      affectedPackages: [
        affectedPackage('npm:lodash', [range('GIT', { kind: 'introduced', version: 'abc' })]),
        affectedPackage('npm:lodash', [range('SEMVER', { kind: 'introduced', version: '0' }, { kind: 'fixed', version: '5.0.0' })]),
      ],
      affectedProducts: [],
    }
    expect(evaluateMatch(component('npm', 'lodash', '4.17.15'), both)).toMatchObject({ status: 'affected', confidence: 'high' })
  })
})
