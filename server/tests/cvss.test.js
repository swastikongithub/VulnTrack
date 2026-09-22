import { describe, expect, it } from 'vitest'
import { cvssSeverity, headlineCvss, parseCvss, scoreCvss } from '../src/utils/cvss.js'

describe('CVSS', () => {
  it('computes v3.x and v2 base scores that match NVD', () => {
    const cases = [
      ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10, 'critical'], // CVE-2021-44228
      ['CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H', 7.2, 'high'], // CVE-2021-23337
      ['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H', 9, 'critical'], // CVE-2021-45046
      ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1, 'medium'],
      ['CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', 7.5, 'high'],
      ['CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N', 1.6, 'low'],
      ['CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N', 0, 'none'],
      ['AV:N/AC:M/Au:N/C:C/I:C/A:C', 9.3, 'high'], // v2 has no "critical"
      ['AV:N/AC:L/Au:N/C:P/I:P/A:P', 7.5, 'high'],
      ['AV:L/AC:H/Au:M/C:P/I:N/A:N', 0.8, 'low'],
    ]
    for (const [vector, score, severity] of cases) {
      expect({ vector, ...scoreCvss(vector) }).toMatchObject({ vector, baseScore: score, severity })
    }
  })

  it('accepts temporal and environmental metrics but scores the base only', () => {
    expect(scoreCvss('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H/E:U/RL:O/RC:R/CR:L/MAV:L').baseScore).toBe(10)
    expect(scoreCvss('(AV:N/AC:M/Au:N/C:C/I:C/A:C)').baseScore).toBe(9.3)
  })

  it('validates v4.0 vectors and uses a source score, never an invented one', () => {
    const vector = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'
    expect(scoreCvss(vector, 9.3)).toMatchObject({ version: '4.0', baseScore: 9.3, severity: 'critical' })
    expect(scoreCvss(vector)).toMatchObject({ version: '4.0', baseScore: null, severity: 'unknown' })
    expect(scoreCvss(vector, 42)).toMatchObject({ baseScore: null })
  })

  it('ignores a source score that disagrees with a v3 vector', () => {
    expect(scoreCvss('CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H', 10).baseScore).toBe(7.2)
  })

  it('rejects malformed vectors', () => {
    for (const vector of [
      '',
      'garbage',
      'CVSS:3.1/AV:N',
      'CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      'CVSS:3.1/AV:N/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/ZZ:Q',
      'CVSS:9.9/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      'CVSS:4.0/AV:N/AC:L',
      `CVSS:3.1/${'AV:N/'.repeat(60)}`,
      null,
      42,
    ]) {
      expect(parseCvss(vector)).toBeNull()
    }
  })

  it('rates scores by each version’s bands', () => {
    expect([0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10].map((s) => cvssSeverity('3.1', s))).toEqual(['none', 'low', 'low', 'medium', 'medium', 'high', 'high', 'critical', 'critical'])
    expect([0, 3.9, 4, 6.9, 7, 10].map((s) => cvssSeverity('2.0', s))).toEqual(['low', 'low', 'medium', 'medium', 'high', 'high'])
    expect(cvssSeverity('3.1', null)).toBe('unknown')
  })

  it('headlines the newest scored version, preferring the primary assessment', () => {
    const entries = [
      { version: '2.0', baseScore: 9.3, primary: true },
      { version: '3.1', baseScore: 9.8, primary: false },
      { version: '3.1', baseScore: 10, primary: true },
      { version: '4.0', baseScore: null, primary: true },
    ]
    expect(headlineCvss(entries)).toMatchObject({ version: '3.1', baseScore: 10 })
    expect(headlineCvss([{ version: '4.0', baseScore: null, primary: true }])).toBeNull()
  })
})
