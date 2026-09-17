import { describe, expect, it } from 'vitest'
import { Asset, AuditLog } from '../src/models/index.js'
import { api, memberOf, signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()
const BASE = '/api/organizations/current/assets'
const body = (overrides = {}) => ({ name: 'Edge Proxy', type: 'server', environment: 'production', criticality: 'high', ...overrides })

/** Alpha organization with one member per role, plus one asset. */
async function alphaTeam() {
  const owner = await signedInBrowser(ctx, { fullName: 'Olivia Owner', workspace: 'Alpha Corp' })
  const orgId = owner.session.organization.id
  const roles = {
    owner,
    admin: await memberOf(ctx, orgId, 'admin', { workspace: 'Admin Personal' }),
    security_analyst: await memberOf(ctx, orgId, 'security_analyst', { workspace: 'Analyst Personal' }),
    developer: await memberOf(ctx, orgId, 'developer', { workspace: 'Dev Personal' }),
    viewer: await memberOf(ctx, orgId, 'viewer', { workspace: 'Viewer Personal' }),
  }
  const { asset } = (await owner.client.post(BASE, body({ identifiers: [{ kind: 'hostname', value: 'edge.alpha.io' }] }))).body
  return { orgId, roles, asset }
}

describe('asset RBAC', () => {
  it('lets every role read; analysts and above create and edit; only owners and admins archive, restore and delete', async () => {
    const { roles, asset } = await alphaTeam()
    const expected = {
      owner: { read: 200, create: 201, update: 200, archive: 200 },
      admin: { read: 200, create: 201, update: 200, archive: 200 },
      security_analyst: { read: 200, create: 201, update: 200, archive: 403 },
      developer: { read: 200, create: 403, update: 403, archive: 403 },
      viewer: { read: 200, create: 403, update: 403, archive: 403 },
    }
    const observed = {}
    for (const role of Object.keys(expected)) {
      const { client } = roles[role]
      const current = async () => (await Asset.findById(asset.id).lean()).revision
      const read = [(await client.get(BASE)).status, (await client.get(`${BASE}/${asset.id}`)).status, (await client.get(`${BASE}/summary`)).status]
      const create = (await client.post(BASE, body({ name: `By ${role}` }))).status
      const update = (await client.patch(`${BASE}/${asset.id}`, { revision: await current(), description: `edited by ${role}` })).status
      const archive = (await client.post(`${BASE}/${asset.id}/archive`, {})).status
      // Put the asset back for the next role (owner restores; restore itself is covered below).
      if (archive === 200) await roles.owner.client.post(`${BASE}/${asset.id}/restore`, {})
      observed[role] = { read: new Set(read).size === 1 ? read[0] : read, create, update, archive }
    }
    expect(observed).toEqual(expected)
    expect(await AuditLog.countDocuments({ action: 'authorization.denied', 'metadata.permission': /^assets:/ })).toBe(7)
  })

  it('exposes capability flags that match the server rules', async () => {
    const { roles, asset } = await alphaTeam()
    const flags = async (role) => (await roles[role].client.get(`${BASE}/${asset.id}`)).body.asset.actions
    expect(await flags('admin')).toEqual({ update: true, archive: true, restore: false, delete: false })
    expect(await flags('security_analyst')).toEqual({ update: true, archive: false, restore: false, delete: false })
    expect(await flags('viewer')).toEqual({ update: false, archive: false, restore: false, delete: false })
  })

  it('refuses restore and permanent delete to roles without assets:delete', async () => {
    const { roles, asset } = await alphaTeam()
    await roles.owner.client.post(`${BASE}/${asset.id}/archive`, {})
    for (const role of ['security_analyst', 'developer', 'viewer']) {
      expect((await roles[role].client.post(`${BASE}/${asset.id}/restore`, {})).status).toBe(403)
      expect((await roles[role].client.delete(`${BASE}/${asset.id}`)).status).toBe(403)
    }
    expect(await Asset.exists({ _id: asset.id, archived: true })).toBeTruthy()
  })

  it('applies a role change on the very next request', async () => {
    const { roles } = await alphaTeam()
    expect((await roles.developer.client.post(BASE, body({ name: 'Before' }))).status).toBe(403)
    await roles.owner.client.patch(`/api/organizations/current/members/${roles.developer.userId}`, { role: 'security_analyst' })
    expect((await roles.developer.client.post(BASE, body({ name: 'After' }))).status).toBe(201)
  })
})

describe('asset tenant isolation', () => {
  it("User A can't read, list, search or modify User B's assets by any id", async () => {
    const alpha = await signedInBrowser(ctx, { workspace: 'Alpha Corp' })
    const beta = await signedInBrowser(ctx, { workspace: 'Beta Corp' })
    const betaOrg = beta.session.organization.id
    const { asset } = (await beta.client.post(BASE, body({ name: 'Beta Secret DB', tags: ['beta-only'] }))).body
    await alpha.client.post(BASE, body({ name: 'Alpha Web' }))

    const attempts = [
      alpha.client.get(`/api/organizations/${betaOrg}/assets`),
      alpha.client.get(`/api/organizations/${betaOrg}/assets/summary`),
      alpha.client.get(`/api/organizations/${betaOrg}/assets/${asset.id}`),
      alpha.client.post(`/api/organizations/${betaOrg}/assets`, body()),
      alpha.client.patch(`/api/organizations/${betaOrg}/assets/${asset.id}`, { revision: 1, name: 'Owned' }),
      alpha.client.post(`/api/organizations/${betaOrg}/assets/${asset.id}/archive`, {}),
      alpha.client.delete(`/api/organizations/${betaOrg}/assets/${asset.id}`),
      // Beta's asset id against Alpha's own organization: not found there.
      alpha.client.get(`${BASE}/${asset.id}`),
      alpha.client.patch(`${BASE}/${asset.id}`, { revision: 1, name: 'Owned' }),
      alpha.client.post(`${BASE}/${asset.id}/archive`, {}),
      alpha.client.post(`${BASE}/${asset.id}/restore`, {}),
      alpha.client.delete(`${BASE}/${asset.id}`),
    ]
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    }

    const own = await alpha.client.get(`${BASE}?q=secret`)
    expect(own.body.total).toBe(0)
    expect((await alpha.client.get(`${BASE}?tag=beta-only`)).body.total).toBe(0)
    expect((await alpha.client.get(`${BASE}/summary`)).body.total).toBe(1)
    expect(await Asset.findById(asset.id).lean()).toMatchObject({ name: 'Beta Secret DB', archived: false, revision: 1 })
  })

  it('scopes identifier uniqueness per organization and never reveals the other tenant', async () => {
    const alpha = await signedInBrowser(ctx, { workspace: 'Alpha Corp' })
    const beta = await signedInBrowser(ctx, { workspace: 'Beta Corp' })
    const shared = { identifiers: [{ kind: 'hostname', value: 'shared.example.com' }] }
    expect((await beta.client.post(BASE, body(shared))).status).toBe(201)
    expect((await alpha.client.post(BASE, body(shared))).status).toBe(201)
  })

  it('does not accept a contact from another organization', async () => {
    const alpha = await signedInBrowser(ctx, { workspace: 'Alpha Corp' })
    const beta = await signedInBrowser(ctx, { workspace: 'Beta Corp' })
    const res = await alpha.client.post(BASE, body({ owner: { contactUserId: beta.session.user.id } }))
    expect(res.status).toBe(400)
    expect(res.body.error.fields['owner.contactUserId']).toBeDefined()
  })

  it('follows the organization switch: assets belong to the current organization only', async () => {
    const riley = await signedInBrowser(ctx, { workspace: 'Riley Personal' })
    const northwind = await signedInBrowser(ctx, { workspace: 'Northwind' })
    const northwindOrg = northwind.session.organization.id
    await northwind.client.post(BASE, body({ name: 'Northwind Asset' }))
    await northwind.client.post('/api/organizations/current/invitations', { email: riley.user.email, role: 'viewer' })
    const { tokenFromEmail } = await import('./support/testApp.js')
    const token = await tokenFromEmail(ctx.mailer, '/invite', riley.user.email)
    expect((await riley.client.post('/api/invitations/accept', { token })).status).toBe(200)

    expect((await riley.client.get(BASE)).body.assets.map((a) => a.name)).toEqual(['Northwind Asset'])
    expect((await riley.client.post(BASE, body())).status).toBe(403) // viewer here
    await riley.client.post('/api/organizations/switch', { organizationId: riley.session.organization.id })
    expect((await riley.client.get(BASE)).body.total).toBe(0)
    expect((await riley.client.post(BASE, body())).status).toBe(201) // owner here
    expect(await Asset.countDocuments({ organizationId: northwindOrg })).toBe(1)
  })
})

describe('asset request hardening', () => {
  it('requires authentication, an allowed Origin, and valid ids', async () => {
    const { asset, roles } = await alphaTeam()
    for (const res of await Promise.all([
      api(ctx.app).get(BASE),
      api(ctx.app).get(`${BASE}/${asset.id}`),
      api(ctx.app).post(BASE, body()),
      api(ctx.app).patch(`${BASE}/${asset.id}`, { revision: 1, name: 'x' }),
      api(ctx.app).delete(`${BASE}/${asset.id}`),
    ])) {
      expect(res.status).toBe(401)
    }

    const noOrigin = await roles.owner.client.agent.post(BASE).send(body({ name: 'CSRF' }))
    expect(noOrigin.status).toBe(403)
    expect(noOrigin.body.error.code).toBe('CSRF_REJECTED')
    const foreign = await roles.owner.client.agent.delete(`${BASE}/${asset.id}`).set('Origin', 'https://evil.example')
    expect(foreign.body.error.code).toBe('CSRF_REJECTED')

    for (const id of ['not-an-id', 'aaaaaaaaaaaa', '0123456789abcdef01234567']) {
      expect((await roles.owner.client.get(`${BASE}/${id}`)).status).toBe(404)
    }
    expect((await roles.owner.client.post(BASE, 'name=x')).status).toBe(415)
  })

  it('rate limits bulk writes per organization', async () => {
    const owner = await signedInBrowser(ctx, { workspace: 'Busy Corp' })
    const { RateLimit } = await import('../src/models/index.js')
    await RateLimit.create({ key: `asset-write:org:${owner.session.organization.id}`, count: 600, resetAt: new Date(Date.now() + 60_000) })
    const res = await owner.client.post(BASE, body())
    expect(res.status).toBe(429)
    expect(res.body.error.retryAfter).toBeGreaterThan(0)
  })
})
