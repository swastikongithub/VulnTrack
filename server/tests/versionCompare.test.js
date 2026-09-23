import { describe, expect, it } from 'vitest'
import { canOrder, comparable, compareVersions } from '../src/services/matching/versionCompare.js'

/** Asserts a strictly ascending list, and that the reverse comparison agrees. */
const ascending = (scheme, versions) => {
  for (let i = 0; i < versions.length - 1; i++) {
    const pair = `${versions[i]} < ${versions[i + 1]}`
    expect({ pair, forward: compareVersions(scheme, versions[i], versions[i + 1]), back: compareVersions(scheme, versions[i + 1], versions[i]) }).toEqual({ pair, forward: -1, back: 1 })
  }
}
const equal = (scheme, a, b) => expect({ a, b, result: compareVersions(scheme, a, b) }).toEqual({ a, b, result: 0 })

describe('version comparison', () => {
  it('orders SemVer by the specification, including prereleases', () => {
    ascending('semver', ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.9.0', '1.10.0', '2.0.0'])
    equal('semver', '1.0.0+build.1', '1.0.0+build.2') // build metadata is not part of precedence
    equal('semver', 'v4.17.21', '4.17.21')
    // The trap this module exists for: string comparison calls 1.9.0 the greater version.
    const asStrings = (a, b) => (a > b ? 1 : a < b ? -1 : 0)
    expect({ versions: compareVersions('semver', '1.9.0', '1.10.0'), strings: asStrings('1.9.0', '1.10.0') }).toEqual({ versions: -1, strings: 1 })
  })

  it('orders Go module versions, including pseudo-versions', () => {
    ascending('go', ['v0.0.0-20210101000000-abcdef123456', 'v0.1.0', 'v1.9.0', 'v1.10.0'])
    equal('go', 'v1.9.1', '1.9.1')
    expect(compareVersions('go', 'v1.9.0', 'v1.10.0')).toBe(-1)
  })

  it('orders PEP 440 versions (epochs, pre/post/dev, local)', () => {
    ascending('pep440', ['1.0.dev1', '1.0a1', '1.0a2', '1.0b1', '1.0rc1', '1.0', '1.0+local', '1.0.post1', '1.0.1', '1.9', '1.10', '2!0.1'])
    equal('pep440', '1.0', '1.0.0')
    equal('pep440', '1.0alpha1', '1.0a1')
    equal('pep440', '2.31.0RC1', '2.31.0rc1')
    expect(compareVersions('pep440', '1.9', '1.10')).toBe(-1)
  })

  it('orders Maven versions by qualifier rank', () => {
    ascending('maven', ['1.0-alpha-1', '1.0-alpha-2', '1.0-beta-1', '1.0-milestone-1', '1.0-rc-1', '1.0-SNAPSHOT', '1.0', '1.0-sp', '1.0.1', '1.1', '2.14.1', '2.15.0'])
    equal('maven', '1.0', '1.0.0')
    equal('maven', '1.0-ga', '1.0')
    equal('maven', '1.0-final', '1.0')
    expect(compareVersions('maven', '1.0-SNAPSHOT', '1.0')).toBe(-1)
  })

  it('orders NuGet versions with four parts and case-insensitive prereleases', () => {
    ascending('nuget', ['1.0.0-alpha', '1.0.0-beta.2', '1.0.0-beta.10', '1.0.0', '1.0.0.1', '1.0.1', '13.0.1', '13.0.2'])
    equal('nuget', '1.0', '1.0.0.0')
    equal('nuget', '1.0.0-Beta', '1.0.0-beta')
    expect(compareVersions('nuget', '1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1)
  })

  it('orders Composer versions by stability', () => {
    ascending('composer', ['1.0.0-dev', '1.0.0-alpha1', '1.0.0-beta2', '1.0.0-RC1', '1.0.0', '1.0.0-pl1', '1.0.1', '9.9.9', '10.3.0'])
    equal('composer', 'v10.3.0', '10.3.0')
    expect(compareVersions('composer', '9.9.9', '10.3.0')).toBe(-1)
  })

  it('orders RubyGems versions, with letters as prereleases', () => {
    ascending('rubygems', ['1.0.0.beta1', '1.0.0.beta2', '1.0.0.rc1', '1.0.0', '1.0.1', '1.9.0', '1.10.0', '7.1.2'])
    equal('rubygems', '1.0', '1.0.0')
    expect(compareVersions('rubygems', '1.0.0.beta1', '1.0.0')).toBe(-1)
  })

  it('refuses to order "other software" versions, which have no scheme', () => {
    expect(canOrder('generic')).toBe(false)
    equal('generic', '1.25.3', '1.25.3')
    expect(compareVersions('generic', '1.25.3', '1.26.0')).toBeNull()
    expect(comparable('generic', '1.25.3', '1.26.0')).toBe(false)
  })

  it('returns null rather than guessing for values it cannot parse', () => {
    for (const [scheme, a, b] of [
      ['semver', 'latest', '1.0.0'],
      ['semver', '1.0', '1.0.0'], // not valid SemVer
      ['semver', '', '1.0.0'],
      ['pep440', 'unknown', '1.0'],
      ['rubygems', 'abc', '1.0'],
      ['nuget', 'not.a.version!', '1.0'],
      ['semver', null, '1.0.0'],
      ['unknown-scheme', '1.0.0', '1.0.1'],
    ]) {
      expect({ scheme, a, result: compareVersions(scheme, a, b) }).toEqual({ scheme, a, result: null })
    }
  })

  it('is antisymmetric and transitive over a mixed sample', () => {
    const sample = ['1.0.0-alpha', '1.0.0', '1.0.1', '1.2.3', '2.0.0-rc.1', '2.0.0', '10.0.0']
    const asymmetric = []
    const intransitive = []
    for (const a of sample) {
      for (const b of sample) {
        // a < b exactly when b > a (the sum is 0 for every pair, including equal ones).
        if (compareVersions('semver', a, b) + compareVersions('semver', b, a) !== 0) asymmetric.push([a, b])
        for (const c of sample) {
          const ordered = compareVersions('semver', a, b) < 0 && compareVersions('semver', b, c) < 0
          if (ordered && compareVersions('semver', a, c) !== -1) intransitive.push([a, b, c])
        }
      }
    }
    expect({ asymmetric, intransitive }).toEqual({ asymmetric: [], intransitive: [] })
  })
})
