import { describe, expect, it } from 'vitest'
import { AuditLog, MatchingRun, VulnerabilityMatch } from '../src/models/index.js'
import { createMatchRunner, MatchingBusyError } from '../src/services/matching/matchRunner.js'
import { createAuditService } from '../src/services/auditService.js'
import { seedCatalogue } from './support/intelligence.js'
import { api, signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()
const ASSETS = '/api/organizations/current/assets'
const MATCHES = '/api/organizations/current/matches'

const runner = () => createMatchRunner({ audit: createAuditService({ config: { authSecret: 'x'.repeat(32) }, logger: null }), logger: null })

/** An organization with one asset and the given components; the catalogue is the Phase 6 fixture set. */
async function workspace(components = [], { seed = true } = {}) {
  if (seed) await seedCatalogue()
  const owner = await signedInBrowser(ctx, { workspace: 'Northwind Security' })
  const organization = { _id: owner.session.organization.id }
  const { asset } = (await owner.client.post(ASSETS, { name: 'Payments API', type: 'api', environment: 'production', criticality: 'critical' })).body
  for (const component of components) {
    const res = await owner.client.post(`${ASSETS}/${asset.id}/software`, component)
    expect({ component, status: res.status }).toEqual({ component, status: 201 })
  }
  return { owner, organization, asset }
}

const lodash = (version) => ({ ecosystem: 'npm', name: 'lodash', version })

describe('matching runs', () => {
  it('finds advisories affecting an installed version and explains why', async () => {
    const { owner, organization } = await workspace([lodash('4.17.15')])
    const run = await runner().run(organization, { trigger: 'test' })

    expect(run.status).toBe('succeeded')
    expect(run.counts).toMatchObject({ components: 1, created: expect.any(Number) })
    expect(run.counts.affected).toBeGreaterThan(0)

    const { body } = await owner.client.get(MATCHES)
    expect(body.total).toBe(run.counts.created)
    const match = body.matches.find((m) => m.vulnerability.sourceId === 'GHSA-35jh-r3h4-6jhm')
    expect(match).toMatchObject({
      status: 'affected',
      confidence: 'high',
      route: 'package',
      component: { name: 'lodash', version: '4.17.15', packageKey: 'npm:lodash' },
      vulnerability: { source: 'osv', severity: 'high', cvssScore: 7.2 },
      reason: { rule: 'range', introduced: '0', end: '4.17.21', endKind: 'fixed' },
    })
    expect(match.fixedVersions).toContain('4.17.21')
    expect(match.explanation).toMatch(/4\.17\.15 is at or above the first release and below 4\.17\.21/)
    expect(match.asset.name).toBe('Payments API')
  })

  it('does not match a version that is already fixed', async () => {
    const { owner, organization } = await workspace([lodash('4.17.21')])
    await runner().run(organization, { trigger: 'test' })
    const { body } = await owner.client.get(`${MATCHES}?pageSize=100`)
    expect(body.matches.filter((m) => m.vulnerability.sourceId === 'GHSA-35jh-r3h4-6jhm')).toEqual([])
    // The lodash advisories fixed at 4.17.21 are gone; later ones (fixed 4.18.0) still apply.
    expect(body.matches.every((m) => m.component.version === '4.17.21')).toBe(true)
  })

  it('evaluates several installed versions of one package independently', async () => {
    const { owner, organization } = await workspace([lodash('4.17.15'), lodash('4.17.21')])
    await runner().run(organization, { trigger: 'test' })
    const { body } = await owner.client.get(`${MATCHES}?q=GHSA-35jh-r3h4-6jhm&pageSize=100`)
    expect(body.matches.map((m) => m.component.version)).toEqual(['4.17.15'])
  })

  it('records a component with no version as undecidable, never as safe or affected', async () => {
    const { owner, organization } = await workspace([{ ecosystem: 'npm', name: 'lodash', version: '' }])
    const run = await runner().run(organization, { trigger: 'test' })
    expect(run.counts.affected).toBe(0)
    expect(run.counts.unknownVersion).toBeGreaterThan(0)
    const { body } = await owner.client.get(`${MATCHES}?status=unknown_version&pageSize=100`)
    expect(body.matches[0]).toMatchObject({ status: 'unknown_version', confidence: 'medium', reason: { rule: 'version_unknown' } })
    expect(body.matches[0].explanation).toMatch(/no recorded version/)
  })

  it('is idempotent: a second run changes nothing', async () => {
    const { organization } = await workspace([lodash('4.17.15')])
    const first = await runner().run(organization, { trigger: 'test' })
    const second = await runner().run(organization, { trigger: 'test' })
    expect(second.counts).toMatchObject({ created: 0, updated: 0, removed: 0, unchanged: first.counts.created })
    expect(await VulnerabilityMatch.countDocuments({})).toBe(first.counts.created)
    // The first detection time is preserved across runs.
    const match = await VulnerabilityMatch.findOne({}).lean()
    expect(match.firstDetectedAt.getTime()).toBeLessThanOrEqual(match.lastEvaluatedAt.getTime())
  })

  it('prunes matches when the inventory changes', async () => {
    const { owner, organization, asset } = await workspace([lodash('4.17.15')])
    await runner().run(organization, { trigger: 'test' })
    const before = await VulnerabilityMatch.countDocuments({})
    expect(before).toBeGreaterThan(0)

    // Upgrading the component drops its stale matches immediately…
    const { body: list } = await owner.client.get('/api/organizations/current/software')
    const component = list.components[0]
    const upgraded = await owner.client.patch(`/api/organizations/current/software/${component.id}`, { version: '4.17.21', revision: component.revision })
    expect(upgraded.status).toBe(200)
    expect(await VulnerabilityMatch.countDocuments({})).toBe(0)

    // …and the next run confirms the package is no longer affected by the fixed advisory.
    const run = await runner().run(organization, { trigger: 'test' })
    expect(run.counts.affected).toBe(0)
    void asset
  })

  it('removes matches when the component or asset goes away', async () => {
    const { owner, organization, asset } = await workspace([lodash('4.17.15')])
    await runner().run(organization, { trigger: 'test' })
    const { body } = await owner.client.get('/api/organizations/current/software')
    await owner.client.delete(`/api/organizations/current/software/${body.components[0].id}`)
    expect(await VulnerabilityMatch.countDocuments({})).toBe(0)

    await owner.client.post(`${ASSETS}/${asset.id}/software`, lodash('4.17.15'))
    await runner().run(organization, { trigger: 'test' })
    expect(await VulnerabilityMatch.countDocuments({})).toBeGreaterThan(0)
    await owner.client.post(`${ASSETS}/${asset.id}/archive`, {})
    await owner.client.delete(`${ASSETS}/${asset.id}`)
    expect(await VulnerabilityMatch.countDocuments({})).toBe(0)
  })

  it('follows an asset into and out of the archive, and keeps its name in step', async () => {
    const { owner, organization, asset } = await workspace([lodash('4.17.15')])
    await runner().run(organization, { trigger: 'test' })
    await owner.client.post(`${ASSETS}/${asset.id}/archive`, {})
    expect(await VulnerabilityMatch.countDocuments({ assetArchived: true })).toBeGreaterThan(0)
    expect((await owner.client.get(MATCHES)).body.total).toBe(0)
    expect((await owner.client.get(`${MATCHES}?archived=true`)).body.total).toBeGreaterThan(0)

    await owner.client.post(`${ASSETS}/${asset.id}/restore`, {})
    expect(await VulnerabilityMatch.countDocuments({ assetArchived: false })).toBeGreaterThan(0)

    const { body: current } = await owner.client.get(`${ASSETS}/${asset.id}`)
    await owner.client.patch(`${ASSETS}/${asset.id}`, { name: 'Payments API (renamed)', revision: current.asset.revision })
    expect((await owner.client.get(MATCHES)).body.matches[0].asset.name).toBe('Payments API (renamed)')
  })

  it('ignores withdrawn advisories', async () => {
    const { organization } = await workspace([lodash('4.17.15')])
    await runner().run(organization, { trigger: 'test' })
    const before = await VulnerabilityMatch.countDocuments({})
    const { Vulnerability } = await import('../src/models/index.js')
    await Vulnerability.updateMany({ source: 'osv' }, { status: 'withdrawn' })
    const run = await runner().run(organization, { trigger: 'test' })
    expect(run.counts.removed).toBe(before)
    expect(await VulnerabilityMatch.countDocuments({})).toBe(0)
  })

  it('matches other software through CPE and reports low confidence', async () => {
    const { owner, organization } = await workspace([{ ecosystem: 'generic', name: 'log4j', vendor: 'Apache', version: '2.14.1' }])
    await runner().run(organization, { trigger: 'test' })
    const { body } = await owner.client.get(`${MATCHES}?pageSize=100`)
    const match = body.matches.find((m) => m.vulnerability.sourceId === 'CVE-2021-44228')
    expect(match).toMatchObject({ route: 'cpe', component: { ecosystem: 'generic' } })
    expect(['affected', 'undetermined']).toContain(match.status)
    expect(['medium', 'low']).toContain(match.confidence)
  })

  it('logs every run and audits it', async () => {
    const { organization } = await workspace([lodash('4.17.15')])
    const run = await runner().run(organization, { trigger: 'test' })
    const doc = await MatchingRun.findById(run.id).lean()
    expect(doc).toMatchObject({ status: 'succeeded', trigger: 'test', counts: { components: 1 } })
    expect(doc.finishedAt).toBeInstanceOf(Date)
    const audit = await AuditLog.findOne({ action: 'matching.run' }).lean()
    expect(audit).toMatchObject({ outcome: 'success', reason: 'succeeded', resourceType: 'matching_run' })
    expect(String(audit.organizationId)).toBe(String(organization._id))
  })

  it('allows one run per organization at a time', async () => {
    const { organization } = await workspace([lodash('4.17.15')])
    await MatchingRun.create({ organizationId: organization._id, startedAt: new Date(), heartbeatAt: new Date() })
    await expect(runner().run(organization, { trigger: 'test' })).rejects.toBeInstanceOf(MatchingBusyError)

    // A run that stopped reporting progress is recovered by the next one.
    await MatchingRun.updateMany({ status: 'running' }, { heartbeatAt: new Date(Date.now() - 60 * 60 * 1000) })
    expect((await runner().run(organization, { trigger: 'test' })).status).toBe('succeeded')
    expect(await MatchingRun.countDocuments({ status: 'failed' })).toBe(1)
  })

  it('reports an empty inventory or an empty catalogue as a clean run', async () => {
    const { owner, organization } = await workspace([], { seed: false })
    const run = await runner().run(organization, { trigger: 'test' })
    expect(run).toMatchObject({ status: 'succeeded', counts: { components: 0, created: 0 } })
    const { body } = await owner.client.get(`${MATCHES}/summary`)
    expect(body).toMatchObject({ total: 0, affectedAssets: 0, lastRun: { status: 'succeeded' } })
  })
})

describe('match API', () => {
  it('filters, sorts and paginates', async () => {
    const { owner, organization } = await workspace([lodash('4.17.15'), { ecosystem: 'pypi', name: 'lxml', version: '4.6.2' }])
    await runner().run(organization, { trigger: 'test' })

    const all = await owner.client.get(`${MATCHES}?pageSize=100`)
    expect(all.body.total).toBeGreaterThan(1)
    const severities = all.body.matches.map((m) => m.vulnerability.severity)
    const ranks = { critical: 5, high: 4, medium: 3, low: 2, none: 1, unknown: 0 }
    expect(severities.map((s) => ranks[s])).toEqual([...severities.map((s) => ranks[s])].sort((a, b) => b - a))

    expect((await owner.client.get(`${MATCHES}?ecosystem=pypi&pageSize=100`)).body.matches.every((m) => m.component.ecosystem === 'pypi')).toBe(true)
    expect((await owner.client.get(`${MATCHES}?status=affected&pageSize=100`)).body.matches.every((m) => m.status === 'affected')).toBe(true)
    expect((await owner.client.get(`${MATCHES}?confidence=high&pageSize=100`)).body.matches.every((m) => m.confidence === 'high')).toBe(true)
    expect((await owner.client.get(`${MATCHES}?q=lxml&pageSize=100`)).body.matches.every((m) => m.component.name === 'lxml')).toBe(true)
    expect((await owner.client.get(`${MATCHES}?sort=package&pageSize=100`)).body.sort).toBe('package')

    const paged = await owner.client.get(`${MATCHES}?pageSize=1&page=2`)
    expect(paged.body).toMatchObject({ page: 2, pageSize: 1 })
    expect(paged.body.matches).toHaveLength(1)

    for (const qs of ['status=maybe', 'confidence=perhaps', 'severity=urgent', 'ecosystem=debian', 'sort=cvss', 'page=0', 'pageSize=500', 'assetId=nope', 'archived=maybe']) {
      const res = await owner.client.get(`${MATCHES}?${qs}`)
      expect({ qs, status: res.status }).toEqual({ qs, status: 400 })
    }
  })

  it('returns one match with its advisory context', async () => {
    const { owner, organization } = await workspace([lodash('4.17.15')])
    await runner().run(organization, { trigger: 'test' })
    const { body: list } = await owner.client.get(`${MATCHES}?q=GHSA-35jh-r3h4-6jhm`)
    const res = await owner.client.get(`${MATCHES}/${list.matches[0].id}`)
    expect(res.status).toBe(200)
    expect(res.body.match).toMatchObject({
      status: 'affected',
      component: { name: 'lodash', purl: 'pkg:npm/lodash@4.17.15' },
      advisory: { cveIds: expect.arrayContaining(['CVE-2021-23337']) },
    })
    expect(res.body.match.advisory.affected[0]).toMatchObject({ name: 'lodash', ranges: expect.any(Array) })
    for (const path of ['/507f1f77bcf86cd799439011', '/not-an-id']) {
      expect((await owner.client.get(`${MATCHES}${path}`)).status).toBe(404)
    }
  })

  it('filters by one advisory, using the id its detail response carries', async () => {
    const { owner, organization } = await workspace([lodash('4.17.15')])
    await runner().run(organization, { trigger: 'test' })
    // The advisory panel filters by this id; without it the list would fall back to everything.
    const { body: advisory } = await owner.client.get('/api/organizations/current/vulnerabilities/osv/GHSA-35jh-r3h4-6jhm')
    expect(advisory.vulnerability.id).toMatch(/^[a-f0-9]{24}$/)

    const filtered = await owner.client.get(`${MATCHES}?vulnerabilityId=${advisory.vulnerability.id}`)
    const all = await owner.client.get(`${MATCHES}?pageSize=100`)
    expect(filtered.body.total).toBeGreaterThan(0)
    expect(filtered.body.total).toBeLessThan(all.body.total)
    expect(filtered.body.matches.every((m) => m.vulnerability.sourceId === 'GHSA-35jh-r3h4-6jhm')).toBe(true)
  })

  it('summarizes what matters for the page header', async () => {
    const { owner, organization } = await workspace([lodash('4.17.15'), { ecosystem: 'npm', name: 'express', version: '' }])
    await runner().run(organization, { trigger: 'test' })
    const { body } = await owner.client.get(`${MATCHES}/summary`)
    expect(body).toMatchObject({
      total: expect.any(Number),
      byStatus: { affected: expect.any(Number), unknown_version: expect.any(Number), undetermined: expect.any(Number) },
      affectedAssets: 1,
      components: 2,
      lastRun: { status: 'succeeded', trigger: 'test' },
    })
    expect(Object.values(body.bySeverity).reduce((a, b) => a + b, 0)).toBe(body.byStatus.affected)
  })

  it('recalculates from the API and reports the run', async () => {
    const { owner } = await workspace([lodash('4.17.15')])
    const res = await owner.client.post(`${MATCHES}/recalculate`, {})
    expect(res.status).toBe(202)
    expect(res.body.run).toMatchObject({ status: 'succeeded', counts: { components: 1 } })
    expect((await owner.client.get(MATCHES)).body.total).toBe(res.body.run.counts.created)

    const second = await owner.client.post(`${MATCHES}/recalculate`, {})
    expect(second.body.run.counts).toMatchObject({ created: 0, updated: 0 })
    const audit = await AuditLog.find({ action: 'matching.run' }).lean()
    expect(audit).toHaveLength(2)
    expect(audit[0].actorUserId).toBeTruthy()
  })

  it('refuses a second concurrent recalculation', async () => {
    const { owner, organization } = await workspace([lodash('4.17.15')])
    await MatchingRun.create({ organizationId: organization._id, startedAt: new Date(), heartbeatAt: new Date() })
    const res = await owner.client.post(`${MATCHES}/recalculate`, {})
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('MATCHING_IN_PROGRESS')
  })

  it('rate-limits recalculation per organization', async () => {
    const { owner } = await workspace([lodash('4.17.15')])
    let limited = null
    for (let i = 0; i < 14 && !limited; i++) {
      const res = await owner.client.post(`${MATCHES}/recalculate`, {})
      if (res.status === 429) limited = res.body
    }
    expect(limited?.error.code).toBe('RATE_LIMITED')
  })

  it('requires the app origin for recalculation, and a session at all', async () => {
    const { owner } = await workspace([lodash('4.17.15')])
    // Signed in, but the request comes from another origin.
    const forged = await owner.client.agent.post(`${MATCHES}/recalculate`).set('Origin', 'https://evil.example').send({})
    expect({ status: forged.status, code: forged.body.error?.code }).toEqual({ status: 403, code: 'CSRF_REJECTED' })
    // No session at all.
    expect((await api(ctx.app).post(`${MATCHES}/recalculate`, {})).status).toBe(401)
  })
})
