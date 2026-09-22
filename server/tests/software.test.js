import { describe, expect, it } from 'vitest'
import { AuditLog, SoftwareComponent } from '../src/models/index.js'
import { signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()
const ASSETS = '/api/organizations/current/assets'
const SOFTWARE = '/api/organizations/current/software'

async function ownerWithAsset(assetOverrides = {}) {
  const owner = await signedInBrowser(ctx, { workspace: 'Alpha Corp' })
  const create = (name, extra = {}) =>
    owner.client.post(ASSETS, { name, type: 'api', environment: 'production', criticality: 'high', ...extra }).then((r) => r.body.asset)
  const asset = await create('Payments API', assetOverrides)
  const add = (assetId, body) => owner.client.post(`${ASSETS}/${assetId}/software`, body)
  return { owner, client: owner.client, asset, create, add }
}

describe('software components: create and read', () => {
  it('adds a component to an asset with server-derived identity', async () => {
    const { client, asset, add } = await ownerWithAsset()
    const res = await add(asset.id, { ecosystem: 'npm', name: 'Express', version: 'v4.18.2', relationship: 'direct', scope: 'runtime' })
    expect(res.status).toBe(201)
    expect(res.body.component).toMatchObject({
      asset: { id: asset.id, name: 'Payments API', archived: false },
      ecosystem: 'npm',
      ecosystemLabel: 'npm',
      name: 'Express',
      version: 'v4.18.2',
      versionNormalized: '4.18.2',
      packageKey: 'npm:express',
      purl: 'pkg:npm/express@4.18.2',
      relationship: 'direct',
      scope: 'runtime',
      source: 'manual',
      revision: 1,
      actions: { update: true, delete: true },
    })
    const got = await client.get(`${SOFTWARE}/${res.body.component.id}`)
    expect(got.status).toBe(200)
    expect(got.body.component.createdBy.fullName).toBeTruthy()
  })

  it('defaults relationship and scope, and allows an unknown version', async () => {
    const { asset, add } = await ownerWithAsset()
    const res = await add(asset.id, { ecosystem: 'generic', name: 'nginx', vendor: 'F5' })
    expect(res.status).toBe(201)
    expect(res.body.component).toMatchObject({ relationship: 'unknown', scope: 'unknown', version: null, versionNormalized: null, purl: 'pkg:generic/f5/nginx' })
  })

  it('returns field errors for names and versions that do not fit the ecosystem', async () => {
    const { asset, add } = await ownerWithAsset()
    const res = await add(asset.id, { ecosystem: 'maven', name: 'log4j-core', version: 'not a version' })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['name', 'version'])
    expect((await add(asset.id, { ecosystem: 'swift', name: 'x' })).body.error.fields).toHaveProperty('ecosystem')
    expect(await SoftwareComponent.countDocuments()).toBe(0)
  })

  it('refuses the same package version twice on one asset, but allows other versions and other assets', async () => {
    const { asset, add, create } = await ownerWithAsset()
    expect((await add(asset.id, { ecosystem: 'pypi', name: 'Django', version: '4.2.1' })).status).toBe(201)
    const duplicate = await add(asset.id, { ecosystem: 'pypi', name: 'django', version: 'v4.2.1' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error).toMatchObject({ code: 'SOFTWARE_COMPONENT_EXISTS', fields: { version: expect.any(String) } })
    expect((await add(asset.id, { ecosystem: 'pypi', name: 'django', version: '3.2.0' })).status).toBe(201)
    const other = await create('Admin portal')
    expect((await add(other.id, { ecosystem: 'pypi', name: 'django', version: '4.2.1' })).status).toBe(201)
  })

  it('resolves concurrent duplicate creates with exactly one success', async () => {
    const { asset, add } = await ownerWithAsset()
    const body = { ecosystem: 'npm', name: 'lodash', version: '4.17.21' }
    const statuses = (await Promise.all([add(asset.id, body), add(asset.id, body), add(asset.id, body)])).map((r) => r.status).sort()
    expect(statuses).toEqual([201, 409, 409])
  })

  it('ignores server-controlled fields in the body', async () => {
    const { asset, add, create } = await ownerWithAsset()
    const other = await create('Other')
    const res = await add(asset.id, {
      ecosystem: 'npm',
      name: 'lodash',
      version: '4.17.21',
      assetId: other.id,
      organizationId: '507f1f77bcf86cd799439011',
      purl: 'pkg:npm/evil@6.6.6',
      componentKey: 'npm:evil',
      versionNormalized: '0.0.0',
      source: 'scanner',
      revision: 99,
      assetArchived: true,
    })
    expect(res.status).toBe(201)
    expect(res.body.component).toMatchObject({ asset: { id: asset.id }, purl: 'pkg:npm/lodash@4.17.21', source: 'manual', revision: 1 })
    const stored = await SoftwareComponent.findById(res.body.component.id).lean()
    expect(stored).toMatchObject({ componentKey: 'npm:lodash', versionNormalized: '4.17.21', assetArchived: false })
  })

  it('404s for unknown or malformed asset and component ids', async () => {
    const { client, add } = await ownerWithAsset()
    expect((await add('507f1f77bcf86cd799439011', { ecosystem: 'npm', name: 'x', version: '1.0.0' })).status).toBe(404)
    expect((await add('not-an-id', { ecosystem: 'npm', name: 'x', version: '1.0.0' })).status).toBe(404)
    expect((await client.get(`${SOFTWARE}/507f1f77bcf86cd799439011`)).status).toBe(404)
    expect((await client.get(`${SOFTWARE}/zzz`)).status).toBe(404)
  })
})

describe('software components: update and delete', () => {
  it('edits with optimistic concurrency and re-derives identity', async () => {
    const { client, asset, add } = await ownerWithAsset()
    const { component } = (await add(asset.id, { ecosystem: 'npm', name: 'lodash', version: '4.17.20' })).body
    const res = await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, version: '4.17.21', scope: 'runtime' })
    expect(res.status).toBe(200)
    expect(res.body.component).toMatchObject({ version: '4.17.21', purl: 'pkg:npm/lodash@4.17.21', scope: 'runtime', revision: 2 })

    const stale = await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, version: '4.17.19' })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('SOFTWARE_CONFLICT')

    const noop = await client.patch(`${SOFTWARE}/${component.id}`, { revision: 2, version: '4.17.21' })
    expect(noop.body.component.revision).toBe(2)

    // Clearing the version makes it unknown.
    const cleared = await client.patch(`${SOFTWARE}/${component.id}`, { revision: 2, version: null })
    expect(cleared.body.component).toMatchObject({ version: null, purl: 'pkg:npm/lodash', revision: 3 })
  })

  it('changing ecosystem re-validates the name and drops a generic vendor', async () => {
    const { client, asset, add } = await ownerWithAsset()
    const { component } = (await add(asset.id, { ecosystem: 'generic', name: 'serde', vendor: 'someone', version: '1.0.0' })).body
    const bad = await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, ecosystem: 'maven' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields).toHaveProperty('name')
    const res = await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, ecosystem: 'cargo' })
    expect(res.status).toBe(200)
    expect(res.body.component).toMatchObject({ ecosystem: 'cargo', vendor: null, packageKey: 'cargo:serde', purl: 'pkg:cargo/serde@1.0.0' })
  })

  it('refuses an edit that would duplicate another component on the asset', async () => {
    const { client, asset, add } = await ownerWithAsset()
    await add(asset.id, { ecosystem: 'npm', name: 'react', version: '18.2.0' })
    const { component } = (await add(asset.id, { ecosystem: 'npm', name: 'react', version: '17.0.2' })).body
    const res = await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, version: '18.2.0' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SOFTWARE_COMPONENT_EXISTS')
  })

  it('deletes a component', async () => {
    const { client, asset, add } = await ownerWithAsset()
    const { component } = (await add(asset.id, { ecosystem: 'npm', name: 'react', version: '18.2.0' })).body
    expect((await client.delete(`${SOFTWARE}/${component.id}`)).status).toBe(200)
    expect((await client.get(`${SOFTWARE}/${component.id}`)).status).toBe(404)
    expect((await client.delete(`${SOFTWARE}/${component.id}`)).status).toBe(404)
  })

  it('audits create, update and delete with the package identity (never free text)', async () => {
    const { client, asset, add } = await ownerWithAsset()
    const { component } = (await add(asset.id, { ecosystem: 'maven', name: 'org.apache.logging.log4j:log4j-core', version: '2.14.1' })).body
    await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, version: '2.17.1' })
    await client.delete(`${SOFTWARE}/${component.id}`)
    const logs = await AuditLog.find({ resourceType: 'software_component' }).sort({ createdAt: 1 }).lean()
    expect(logs.map((l) => l.action)).toEqual(['software.create', 'software.update', 'software.delete'])
    expect(logs.every((l) => String(l.metadata.assetId) === asset.id && String(l.resourceId) === component.id)).toBe(true)
    expect(logs[1].metadata.fields).toEqual(['version'])
    expect(logs[1].metadata.changes).toEqual([{ field: 'versionNormalized', from: '2.14.1', to: '2.17.1' }])
    expect(logs[2].metadata.changes.find((c) => c.field === 'componentKey')).toMatchObject({ from: 'maven:org.apache.logging.log4j:log4j-core', to: null })
  })
})

describe('software follows its asset', () => {
  it('archived assets make their software read-only and hidden from the live inventory', async () => {
    const { client, asset, add } = await ownerWithAsset()
    const { component } = (await add(asset.id, { ecosystem: 'npm', name: 'react', version: '18.2.0' })).body
    await client.post(`${ASSETS}/${asset.id}/archive`, {})

    expect((await client.get(SOFTWARE)).body.total).toBe(0)
    const own = await client.get(`${SOFTWARE}?assetId=${asset.id}`)
    expect(own.body.total).toBe(1)
    expect(own.body.components[0]).toMatchObject({ asset: { archived: true }, actions: { update: false, delete: false } })
    expect((await add(asset.id, { ecosystem: 'npm', name: 'vue', version: '3.3.0' })).body.error.code).toBe('ASSET_ARCHIVED')
    expect((await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, version: '18.3.0' })).body.error.code).toBe('ASSET_ARCHIVED')
    expect((await client.delete(`${SOFTWARE}/${component.id}`)).body.error.code).toBe('ASSET_ARCHIVED')
    expect((await client.get(`${SOFTWARE}/summary`)).body.total).toBe(0)

    await client.post(`${ASSETS}/${asset.id}/restore`, {})
    expect((await client.get(SOFTWARE)).body.total).toBe(1)
    expect((await client.patch(`${SOFTWARE}/${component.id}`, { revision: 1, version: '18.3.0' })).status).toBe(200)
  })

  it('deleting an asset deletes its software and records how many', async () => {
    const { client, asset, add, create } = await ownerWithAsset()
    const keep = await create('Keeps its software')
    await add(asset.id, { ecosystem: 'npm', name: 'react', version: '18.2.0' })
    await add(asset.id, { ecosystem: 'npm', name: 'react-dom', version: '18.2.0' })
    await add(keep.id, { ecosystem: 'npm', name: 'react', version: '18.2.0' })
    await client.post(`${ASSETS}/${asset.id}/archive`, {})
    expect((await client.delete(`${ASSETS}/${asset.id}`)).status).toBe(200)
    expect(await SoftwareComponent.countDocuments({ assetId: asset.id })).toBe(0)
    expect(await SoftwareComponent.countDocuments({ assetId: keep.id })).toBe(1)
    const log = await AuditLog.findOne({ action: 'asset.delete' }).lean()
    expect(log.metadata.count).toBe(2)
  })
})

describe('software inventory listing', () => {
  async function seeded() {
    const setup = await ownerWithAsset()
    const web = await setup.create('Customer portal')
    const rows = [
      [setup.asset.id, { ecosystem: 'npm', name: 'lodash', version: '4.17.21', relationship: 'transitive', scope: 'runtime' }],
      [setup.asset.id, { ecosystem: 'npm', name: 'express', version: '4.18.2', relationship: 'direct', scope: 'runtime' }],
      [setup.asset.id, { ecosystem: 'npm', name: 'jest', version: '29.7.0', relationship: 'direct', scope: 'development' }],
      [web.id, { ecosystem: 'npm', name: 'lodash', version: '4.17.15' }],
      [web.id, { ecosystem: 'pypi', name: 'Django', version: '4.2.1' }],
      [web.id, { ecosystem: 'generic', name: 'nginx', vendor: 'F5' }],
    ]
    for (const [assetId, body] of rows) expect((await setup.add(assetId, body)).status).toBe(201)
    return { ...setup, web }
  }

  it('searches, filters, sorts and paginates', async () => {
    const { client, asset } = await seeded()
    const names = async (qs) => (await client.get(`${SOFTWARE}?${qs}`)).body.components.map((c) => `${c.name}@${c.version ?? '?'}`)

    expect(await names('')).toEqual(['Django@4.2.1', 'express@4.18.2', 'jest@29.7.0', 'lodash@4.17.15', 'lodash@4.17.21', 'nginx@?'])
    expect(await names('q=LODASH')).toEqual(['lodash@4.17.15', 'lodash@4.17.21'])
    expect(await names('q=pkg:pypi')).toEqual(['Django@4.2.1'])
    expect(await names('q=f5')).toEqual(['nginx@?'])
    expect(await names('ecosystem=pypi,generic')).toEqual(['Django@4.2.1', 'nginx@?'])
    expect(await names('scope=development')).toEqual(['jest@29.7.0'])
    expect(await names('relationship=direct')).toEqual(['express@4.18.2', 'jest@29.7.0'])
    expect(await names('version=unknown')).toEqual(['nginx@?'])
    expect(await names(`assetId=${asset.id}`)).toEqual(['express@4.18.2', 'jest@29.7.0', 'lodash@4.17.21'])
    expect(await names('sort=name&order=desc&pageSize=3')).toEqual(['nginx@?', 'lodash@4.17.15', 'lodash@4.17.21'])

    const page = (await client.get(`${SOFTWARE}?pageSize=4&page=2`)).body
    expect(page).toMatchObject({ page: 2, pageSize: 4, total: 6, totalPages: 2 })
    expect(page.components).toHaveLength(2)
  })

  it('treats search text literally', async () => {
    const { client } = await seeded()
    expect((await client.get(`${SOFTWARE}?q=${encodeURIComponent('.*')}`)).body.total).toBe(0)
    expect((await client.get(`${SOFTWARE}?q=${encodeURIComponent('(')}`)).status).toBe(200)
  })

  it('rejects invalid query parameters', async () => {
    const { client } = await seeded()
    for (const qs of ['ecosystem=swift', 'sort=version', 'version=maybe', 'assetId=abc', 'pageSize=500', 'ecosystem=npm&ecosystem=pypi']) {
      expect({ qs, status: (await client.get(`${SOFTWARE}?${qs}`)).status }).toEqual({ qs, status: 400 })
    }
    expect((await client.get(`${SOFTWARE}?assetId=507f1f77bcf86cd799439011`)).status).toBe(404)
  })

  it('summarizes the live software inventory', async () => {
    const { client } = await seeded()
    const summary = (await client.get(`${SOFTWARE}/summary`)).body
    expect(summary).toMatchObject({ total: 6, packages: 5, assets: 2, unknownVersions: 1, multiVersionPackages: 1 })
    expect(summary.byEcosystem).toMatchObject({ npm: 4, pypi: 1, generic: 1, maven: 0 })
    expect(summary.topPackages[0]).toMatchObject({ packageKey: 'npm:lodash', name: 'lodash', assets: 2, versions: 2 })
  })
})
