import { describe, expect, it } from 'vitest'
import { Vulnerability } from '../src/models/index.js'
import { seedCatalogue } from './support/intelligence.js'
import { signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()
const BASE = '/api/organizations/current/vulnerabilities'

async function reader() {
  await seedCatalogue()
  return (await signedInBrowser(ctx)).client
}
const ids = (res) => res.body.vulnerabilities.map((v) => `${v.source}:${v.sourceId}`)

describe('vulnerability catalogue: listing', () => {
  it('lists active advisories, most recently modified first, without heavy fields', async () => {
    const client = await reader()
    const res = await client.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ page: 1, pageSize: 25, total: 8, totalPages: 1, sort: 'modified', order: 'desc' })
    const modified = res.body.vulnerabilities.map((v) => v.modifiedAt)
    expect(modified).toEqual([...modified].sort().reverse())

    const log4 = res.body.vulnerabilities.find((v) => v.sourceId === 'CVE-2021-44228')
    expect(log4).toMatchObject({
      source: 'nvd', sourceLabel: 'NVD', severity: 'critical', severityLabel: 'Critical', cvssScore: 10, knownExploited: true,
      status: 'active', packageCount: 0, productCount: expect.any(Number),
    })
    expect(log4.products.length).toBeGreaterThan(0)
    for (const heavy of ['description', 'references', 'affectedProducts', 'affectedPackages', 'cvss', 'contentHash', 'idKeys', '_id']) {
      expect(log4).not.toHaveProperty(heavy)
    }
    const ghsa = res.body.vulnerabilities.find((v) => v.sourceId === 'GHSA-35jh-r3h4-6jhm')
    expect(ghsa.packages[0]).toEqual({ ecosystem: 'npm', ecosystemLabel: 'npm', name: 'lodash' })
    expect(ghsa.packageCount).toBeGreaterThan(1)
  })

  it('finds advisories by any of their IDs, case-insensitively', async () => {
    const client = await reader()
    expect(ids(await client.get(`${BASE}?q=cve-2021-44228`))).toEqual(['nvd:CVE-2021-44228'])
    // The NVD record and the GitHub advisory that aliases it.
    expect(ids(await client.get(`${BASE}?q=CVE-2021-23337&sort=id`)).sort()).toEqual(['nvd:CVE-2021-23337', 'osv:GHSA-35jh-r3h4-6jhm'])
    expect(ids(await client.get(`${BASE}?q=ghsa-35jh-r3h4-6jhm`))).toEqual(['osv:GHSA-35jh-r3h4-6jhm'])
    expect((await client.get(`${BASE}?q=CVE-1999-0001`)).body.total).toBe(0)
  })

  it('searches summaries and package names as literal words', async () => {
    const client = await reader()
    const lxml = await client.get(`${BASE}?q=lxml`)
    expect(ids(lxml)).toEqual(['osv:PYSEC-2021-19'])
    // "-" and quotes are not query syntax to the user: -lodash still means lodash.
    const negated = await client.get(`${BASE}?q=${encodeURIComponent('-lodash')}`)
    expect(negated.body.total).toBeGreaterThan(0)
    expect((await client.get(`${BASE}?q=${encodeURIComponent('".*" $where')}`)).status).toBe(200)
  })

  it('filters by severity, source, ecosystem, exploitation and status', async () => {
    const client = await reader()
    expect((await client.get(`${BASE}?severity=critical`)).body.vulnerabilities.every((v) => v.severity === 'critical')).toBe(true)
    expect(ids(await client.get(`${BASE}?source=nvd&sort=id`))).toEqual(['nvd:CVE-2021-23337', 'nvd:CVE-2021-44228', 'nvd:CVE-2021-45046'])
    expect(ids(await client.get(`${BASE}?ecosystem=pypi`))).toEqual(['osv:PYSEC-2021-19'])
    expect(ids(await client.get(`${BASE}?exploited=true&sort=id`))).toEqual(['nvd:CVE-2021-44228', 'nvd:CVE-2021-45046'])

    await Vulnerability.updateOne({ sourceId: 'CVE-2021-45046' }, { status: 'rejected' })
    expect((await client.get(BASE)).body.total).toBe(7)
    expect(ids(await client.get(`${BASE}?status=rejected`))).toEqual(['nvd:CVE-2021-45046'])
    expect((await client.get(`${BASE}?status=any`)).body.total).toBe(8)
  })

  it('sorts by severity and by ID, and paginates', async () => {
    const client = await reader()
    const bySeverity = (await client.get(`${BASE}?sort=severity`)).body.vulnerabilities
    expect(bySeverity[0].severity).toBe('critical')
    const ranks = { critical: 5, high: 4, medium: 3, low: 2, none: 1, unknown: 0 }
    expect(bySeverity.map((v) => ranks[v.severity])).toEqual(bySeverity.map((v) => ranks[v.severity]).sort((a, b) => b - a))

    const byId = await client.get(`${BASE}?sort=id&pageSize=4&page=2`)
    expect(byId.body).toMatchObject({ page: 2, pageSize: 4, total: 8, totalPages: 2, order: 'asc' })
    expect(byId.body.vulnerabilities).toHaveLength(4)
    expect((await client.get(`${BASE}?page=9`)).body.vulnerabilities).toEqual([])
  })

  it('rejects invalid query parameters', async () => {
    const client = await reader()
    for (const qs of ['severity=urgent', 'source=cve', 'ecosystem=debian', 'status=gone', 'exploited=yes', 'sort=cvss', 'order=up', 'page=0', 'pageSize=500', `q=${'a'.repeat(101)}`]) {
      const res = await client.get(`${BASE}?${qs}`)
      expect({ qs, status: res.status }).toEqual({ qs, status: 400 })
    }
  })
})

describe('vulnerability catalogue: detail', () => {
  it('returns the full normalized record with provenance', async () => {
    const client = await reader()
    const res = await client.get(`${BASE}/nvd/CVE-2021-44228`)
    expect(res.status).toBe(200)
    const v = res.body.vulnerability
    expect(v).toMatchObject({
      source: 'nvd', sourceId: 'CVE-2021-44228', sourceName: 'National Vulnerability Database',
      sourceUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228', sourceStatus: 'Analyzed',
      severity: 'critical', cvssScore: 10, weaknesses: expect.arrayContaining(['CWE-917']),
      knownExploited: { name: 'Apache Log4j2 Remote Code Execution Vulnerability', addedAt: '2021-12-10T00:00:00.000Z' },
    })
    expect(v.cvss[0]).toMatchObject({ version: '3.1', baseScore: 10, severityLabel: 'Critical' })
    expect(v.description).toMatch(/JNDI/)
    expect(v.references.every((r) => /^https?:\/\//.test(r.url) && r.typeLabel)).toBe(true)
    expect(v.affectedProducts.length).toBe(v.productCount)
    expect(v).not.toHaveProperty('contentHash')
    expect(v).not.toHaveProperty('idKeys')
    expect(v).not.toHaveProperty('_id')
  })

  it('links related records through shared IDs without merging them', async () => {
    const client = await reader()
    const cve = (await client.get(`${BASE}/nvd/CVE-2021-23337`)).body.vulnerability
    expect(cve.related.map((r) => r.sourceId)).toEqual(['GHSA-35jh-r3h4-6jhm'])
    const ghsa = (await client.get(`${BASE}/osv/GHSA-35jh-r3h4-6jhm`)).body.vulnerability
    expect(ghsa.related.map((r) => `${r.source}:${r.sourceId}`)).toEqual(['nvd:CVE-2021-23337'])
    expect(ghsa.affectedPackages.find((p) => p.name === 'lodash')).toMatchObject({ packageKey: 'npm:lodash', ranges: [expect.objectContaining({ type: 'SEMVER' })] })
    expect(ghsa.related[0].packageCount).toBe(0)
  })

  it('resolves IDs case-insensitively and 404s everything else alike', async () => {
    const client = await reader()
    expect((await client.get(`${BASE}/osv/ghsa-35jh-r3h4-6jhm`)).body.vulnerability.sourceId).toBe('GHSA-35jh-r3h4-6jhm')
    expect((await client.get(`${BASE}/nvd/cve-2021-44228`)).status).toBe(200)
    for (const path of ['/nvd/CVE-1999-0001', '/osv/CVE-2021-44228', '/cve/CVE-2021-44228', '/nvd/not%20an%20id', '/nvd/%24ne']) {
      const res = await client.get(`${BASE}${path}`)
      expect({ path, status: res.status, code: res.body.error?.code }).toEqual({ path, status: 404, code: 'NOT_FOUND' })
    }
  })
})

describe('vulnerability catalogue: summary', () => {
  it('counts the active catalogue and reports each source’s freshness', async () => {
    const client = await reader()
    const res = await client.get(`${BASE}/summary`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 8, active: 8, knownExploited: 2 })
    expect(Object.values(res.body.bySeverity).reduce((a, b) => a + b, 0)).toBe(8)
    const nvd = res.body.sources.find((s) => s.source === 'nvd')
    expect(nvd).toMatchObject({ label: 'NVD', records: 3, lastRun: { status: 'succeeded', mode: 'file' }, lastSuccessAt: expect.any(String) })
    expect(res.body.sources.find((s) => s.source === 'osv').records).toBe(5)
  })

  it('works on an empty catalogue', async () => {
    const { client } = await signedInBrowser(ctx)
    const res = await client.get(`${BASE}/summary`)
    expect(res.body).toMatchObject({ total: 0, active: 0, knownExploited: 0 })
    expect(res.body.sources.map((s) => [s.source, s.records, s.lastRun])).toEqual([['nvd', 0, null], ['osv', 0, null]])
    expect((await client.get(BASE)).body).toMatchObject({ total: 0, vulnerabilities: [] })
  })
})
