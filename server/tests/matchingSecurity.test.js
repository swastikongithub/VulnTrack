import { describe, expect, it } from 'vitest'
import { AuditLog, VulnerabilityMatch } from '../src/models/index.js'
import { createAuditService } from '../src/services/auditService.js'
import { createMatchRunner } from '../src/services/matching/matchRunner.js'
import { seedCatalogue } from './support/intelligence.js'
import { api, memberOf, signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()
const ASSETS = '/api/organizations/current/assets'
const MATCHES = '/api/organizations/current/matches'

const runner = () => createMatchRunner({ audit: createAuditService({ config: { authSecret: 'x'.repeat(32) }, logger: null }), logger: null })

/** An organization with lodash 4.17.15 installed and matches already computed. */
async function matchedWorkspace(workspaceName) {
  const owner = await signedInBrowser(ctx, { workspace: workspaceName })
  const { asset } = (await owner.client.post(ASSETS, { name: `${workspaceName} API`, type: 'api', environment: 'production', criticality: 'high' })).body
  await owner.client.post(`${ASSETS}/${asset.id}/software`, { ecosystem: 'npm', name: 'lodash', version: '4.17.15' })
  await runner().run({ _id: owner.session.organization.id }, { trigger: 'test' })
  return { owner, asset, organizationId: owner.session.organization.id }
}

describe('matching access control', () => {
  it('lets every role read matches; only the security team recalculates', async () => {
    await seedCatalogue()
    const { owner, organizationId } = await matchedWorkspace('Alpha Corp')
    const roles = {
      owner: owner.client,
      admin: (await memberOf(ctx, organizationId, 'admin', { workspace: 'Admin Personal' })).client,
      security_analyst: (await memberOf(ctx, organizationId, 'security_analyst', { workspace: 'Analyst Personal' })).client,
      developer: (await memberOf(ctx, organizationId, 'developer', { workspace: 'Dev Personal' })).client,
      viewer: (await memberOf(ctx, organizationId, 'viewer', { workspace: 'Viewer Personal' })).client,
    }
    const expected = {
      owner: { read: 200, recalculate: 202 },
      admin: { read: 200, recalculate: 202 },
      security_analyst: { read: 200, recalculate: 202 },
      developer: { read: 200, recalculate: 403 },
      viewer: { read: 200, recalculate: 403 },
    }
    const observed = {}
    for (const [role, client] of Object.entries(roles)) {
      const list = (await client.get(MATCHES)).status
      const summary = (await client.get(`${MATCHES}/summary`)).status
      observed[role] = { read: list === summary ? list : `${list}/${summary}`, recalculate: (await client.post(`${MATCHES}/recalculate`, {})).status }
    }
    expect(observed).toEqual(expected)

    // Denied writes are audited, as everywhere else.
    const denied = await AuditLog.find({ action: 'authorization.denied', 'metadata.permission': 'findings:create' }).lean()
    expect(denied).toHaveLength(2)
    expect(denied.map((entry) => entry.metadata.role).sort()).toEqual(['developer', 'viewer'])
  })

  it('keeps matches inside their organization, even though advisories are shared', async () => {
    await seedCatalogue()
    const alpha = await matchedWorkspace('Alpha Corp')
    const beta = await matchedWorkspace('Beta Ltd')

    const alphaMatches = (await alpha.owner.client.get(`${MATCHES}?pageSize=100`)).body
    const betaMatches = (await beta.owner.client.get(`${MATCHES}?pageSize=100`)).body
    expect(alphaMatches.total).toBeGreaterThan(0)
    expect(betaMatches.total).toBe(alphaMatches.total) // same catalogue, same inventory shape
    // …but they are different rows, about each organization's own asset.
    expect(alphaMatches.matches.map((m) => m.id).some((id) => betaMatches.matches.map((n) => n.id).includes(id))).toBe(false)
    expect(alphaMatches.matches.every((m) => m.asset.name === 'Alpha Corp API')).toBe(true)

    // Another organization's match id is simply not found.
    const foreign = betaMatches.matches[0].id
    expect((await alpha.owner.client.get(`${MATCHES}/${foreign}`)).status).toBe(404)
    // Nor through its organization id.
    expect((await alpha.owner.client.get(`/api/organizations/${beta.organizationId}/matches`)).status).toBe(404)
    expect((await alpha.owner.client.post(`/api/organizations/${beta.organizationId}/matches/recalculate`, {})).status).toBe(404)
    // Filtering by another organization's asset yields nothing, not an error that confirms it exists.
    const probe = await alpha.owner.client.get(`${MATCHES}?assetId=${beta.asset.id}`)
    expect({ status: probe.status, total: probe.body.total }).toEqual({ status: 200, total: 0 })
  })

  it('requires a session for every endpoint', async () => {
    for (const path of [MATCHES, `${MATCHES}/summary`, `${MATCHES}/507f1f77bcf86cd799439011`]) {
      expect((await api(ctx.app).get(path)).status).toBe(401)
    }
    expect((await api(ctx.app).post(`${MATCHES}/recalculate`, {})).status).toBe(401)
  })

  it('has no endpoint that edits or deletes a match', async () => {
    await seedCatalogue()
    const { owner } = await matchedWorkspace('Alpha Corp')
    const { body } = await owner.client.get(MATCHES)
    const id = body.matches[0].id
    const before = await VulnerabilityMatch.findById(id).lean()

    for (const [method, path, payload] of [
      ['patch', `${MATCHES}/${id}`, { status: 'affected' }],
      ['delete', `${MATCHES}/${id}`, undefined],
      ['post', MATCHES, { status: 'affected' }],
      ['patch', `${MATCHES}/${id}/status`, { status: 'closed' }],
    ]) {
      const res = await owner.client[method](path, payload)
      expect({ method, path, status: res.status }).toEqual({ method, path, status: 404 })
    }
    expect(await VulnerabilityMatch.findById(id).lean()).toEqual(before)
  })

  it('ignores query-operator syntax and rejects repeated parameters', async () => {
    await seedCatalogue()
    const { owner } = await matchedWorkspace('Alpha Corp')
    const total = (await owner.client.get(MATCHES)).body.total
    const operators = await owner.client.get(`${MATCHES}?status[$ne]=affected&q[$regex]=.*`)
    expect({ status: operators.status, total: operators.body.total }).toEqual({ status: 200, total })
    expect((await owner.client.get(`${MATCHES}?status=affected&status=undetermined`)).status).toBe(400)
    // Search text is matched literally, not as a regular expression.
    expect((await owner.client.get(`${MATCHES}?q=${encodeURIComponent('.*')}`)).body.total).toBe(0)
  })

  it('never exposes internal fields', async () => {
    await seedCatalogue()
    const { owner } = await matchedWorkspace('Alpha Corp')
    const { body } = await owner.client.get(MATCHES)
    for (const key of ['_id', 'organizationId', 'runId', 'componentId', 'vulnerabilityId', 'assetId', 'severityRank', 'assetName']) {
      expect(body.matches[0]).not.toHaveProperty(key)
    }
    // Ids the UI needs are nested under the thing they identify.
    expect(body.matches[0].asset.id).toBeTruthy()
    expect(body.matches[0].component.id).toBeTruthy()
    expect(body.matches[0].vulnerability.id).toBeTruthy()
  })
})
