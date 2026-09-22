import { describe, expect, it } from 'vitest'
import { AuditLog, SoftwareComponent } from '../src/models/index.js'
import { api, memberOf, signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()
const ASSETS = '/api/organizations/current/assets'
const SOFTWARE = '/api/organizations/current/software'
const assetBody = (name) => ({ name, type: 'api', environment: 'production', criticality: 'high' })

/** Alpha organization with one member per role, an asset and one component on it. */
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
  const { asset } = (await owner.client.post(ASSETS, assetBody('Payments API'))).body
  const { component } = (await owner.client.post(`${ASSETS}/${asset.id}/software`, { ecosystem: 'npm', name: 'lodash', version: '4.17.21' })).body
  return { orgId, roles, asset, component }
}

describe('software RBAC', () => {
  it('lets every role read; analysts, admins and owners add, edit and remove', async () => {
    const { roles, asset, component } = await alphaTeam()
    const expected = {
      owner: { read: 200, create: 201, update: 200, remove: 200 },
      admin: { read: 200, create: 201, update: 200, remove: 200 },
      security_analyst: { read: 200, create: 201, update: 200, remove: 200 },
      developer: { read: 200, create: 403, update: 403, remove: 403 },
      viewer: { read: 200, create: 403, update: 403, remove: 403 },
    }
    const observed = {}
    for (const role of Object.keys(expected)) {
      const { client } = roles[role]
      const read = [
        (await client.get(SOFTWARE)).status,
        (await client.get(`${SOFTWARE}/summary`)).status,
        (await client.get(`${SOFTWARE}/${component.id}`)).status,
        (await client.get(`${SOFTWARE}?assetId=${asset.id}`)).status,
      ]
      const create = await client.post(`${ASSETS}/${asset.id}/software`, { ecosystem: 'npm', name: `pkg-${role.replace('_', '-')}`, version: '1.0.0' })
      const revision = (await SoftwareComponent.findById(component.id).lean()).revision
      const update = (await client.patch(`${SOFTWARE}/${component.id}`, { revision, scope: revision % 2 ? 'runtime' : 'development' })).status
      // Remove what this role created (or try to remove the shared component when creation was refused).
      const target = create.status === 201 ? create.body.component.id : component.id
      const remove = (await client.delete(`${SOFTWARE}/${target}`)).status
      observed[role] = { read: new Set(read).size === 1 ? read[0] : read, create: create.status, update, remove }
    }
    expect(observed).toEqual(expected)
    expect(await SoftwareComponent.exists({ _id: component.id })).toBeTruthy()
    expect(await AuditLog.countDocuments({ action: 'authorization.denied', 'metadata.permission': 'assets:update' })).toBe(6)
  })

  it('exposes capability flags that match the server rules', async () => {
    const { roles, component } = await alphaTeam()
    const flags = async (role) => (await roles[role].client.get(`${SOFTWARE}/${component.id}`)).body.component.actions
    expect(await flags('security_analyst')).toEqual({ update: true, delete: true })
    expect(await flags('developer')).toEqual({ update: false, delete: false })
    expect(await flags('viewer')).toEqual({ update: false, delete: false })
  })
})

describe('software tenant isolation', () => {
  it("can't read, list, add to, edit or delete another organization's software by any id", async () => {
    const alpha = await signedInBrowser(ctx, { workspace: 'Alpha Corp' })
    const beta = await signedInBrowser(ctx, { workspace: 'Beta Corp' })
    const betaOrg = beta.session.organization.id
    const { asset: betaAsset } = (await beta.client.post(ASSETS, assetBody('Beta Core'))).body
    const { component } = (await beta.client.post(`${ASSETS}/${betaAsset.id}/software`, { ecosystem: 'pypi', name: 'beta-secret', version: '1.0.0' })).body
    const { asset: alphaAsset } = (await alpha.client.post(ASSETS, assetBody('Alpha Web'))).body

    const attempts = [
      // Addressing Beta's organization directly: not a member.
      alpha.client.get(`/api/organizations/${betaOrg}/software`),
      alpha.client.get(`/api/organizations/${betaOrg}/software/summary`),
      alpha.client.get(`/api/organizations/${betaOrg}/software/${component.id}`),
      alpha.client.post(`/api/organizations/${betaOrg}/assets/${betaAsset.id}/software`, { ecosystem: 'npm', name: 'x', version: '1.0.0' }),
      // Beta's ids inside Alpha's own organization: not found either.
      alpha.client.get(`${SOFTWARE}/${component.id}`),
      alpha.client.get(`${SOFTWARE}?assetId=${betaAsset.id}`),
      alpha.client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, version: '6.6.6' }),
      alpha.client.delete(`${SOFTWARE}/${component.id}`),
      alpha.client.post(`${ASSETS}/${betaAsset.id}/software`, { ecosystem: 'npm', name: 'x', version: '1.0.0' }),
    ]
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404)
      expect(JSON.stringify(res.body)).not.toContain('beta-secret')
    }

    // Alpha's own views never include Beta's data.
    const list = (await alpha.client.get(`${SOFTWARE}?q=beta`)).body
    expect(list.total).toBe(0)
    expect((await alpha.client.get(`${SOFTWARE}/summary`)).body.total).toBe(0)
    expect((await alpha.client.post(`${ASSETS}/${alphaAsset.id}/software`, { ecosystem: 'pypi', name: 'beta-secret', version: '1.0.0' })).status).toBe(201)
    expect((await SoftwareComponent.findById(component.id).lean()).version).toBe('1.0.0')
  })
})

describe('software request hardening', () => {
  it('rejects query-operator objects and non-string values', async () => {
    const { roles, asset, component } = await alphaTeam()
    const { client } = roles.owner
    const bodies = [
      { ecosystem: 'npm', name: { $gt: '' }, version: '1.0.0' },
      { ecosystem: { $ne: null }, name: 'x', version: '1.0.0' },
      { ecosystem: 'npm', name: 'x', version: ['1.0.0'] },
    ]
    for (const body of bodies) expect((await client.post(`${ASSETS}/${asset.id}/software`, body)).status).toBe(400)
    expect((await client.patch(`${SOFTWARE}/${component.id}`, { revision: { $gt: 0 }, version: '1.0.0' })).status).toBe(400)
    expect((await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1 })).status).toBe(400)
  })

  it('requires the app origin for writes and a session for everything', async () => {
    const { roles, asset, component } = await alphaTeam()
    const noOrigin = await roles.owner.client.agent
      .post(`${ASSETS}/${asset.id}/software`)
      .send({ ecosystem: 'npm', name: 'csrf', version: '1.0.0' })
    expect(noOrigin.status).toBe(403)
    const foreign = await roles.owner.client.agent.delete(`${SOFTWARE}/${component.id}`).set('Origin', 'https://evil.example')
    expect(foreign.status).toBe(403)
    expect(await SoftwareComponent.exists({ _id: component.id })).toBeTruthy()

    expect((await api(ctx.app).get(SOFTWARE)).status).toBe(401)
    expect((await api(ctx.app).post(`${ASSETS}/${asset.id}/software`, { ecosystem: 'npm', name: 'x', version: '1.0.0' })).status).toBe(401)
  })
})
