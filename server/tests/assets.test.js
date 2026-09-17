import { describe, expect, it } from 'vitest'
import { Asset, AuditLog } from '../src/models/index.js'
import { normalizeIdentifier } from '../src/utils/assetIdentifiers.js'
import { memberOf, signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()
const BASE = '/api/organizations/current/assets'

export const assetPayload = (overrides = {}) => ({
  name: 'Production API',
  type: 'api',
  environment: 'production',
  criticality: 'critical',
  exposure: 'internet_facing',
  description: 'Public REST API',
  identifiers: [{ kind: 'url', value: 'https://API.northwind.dev/' }],
  tags: ['PCI', 'payments'],
  technologies: ['Node.js', 'Express'],
  owner: { team: 'Backend Team' },
  ...overrides,
})

async function owner() {
  const signedIn = await signedInBrowser(ctx, { fullName: 'Olivia Owner', workspace: 'Northwind' })
  return { ...signedIn, orgId: signedIn.session.organization.id, userId: signedIn.session.user.id }
}

describe('identifier normalization', () => {
  it('normalizes equivalent identifiers to one key and rejects unsafe values', () => {
    expect(normalizeIdentifier('url', 'HTTPS://Api.Example.com:443/v1/?x=1#y').normalized).toBe('https://api.example.com/v1')
    expect(normalizeIdentifier('url', 'javascript:alert(1)').error).toMatch(/http/)
    expect(normalizeIdentifier('url', 'https://user:pass@example.com').error).toMatch(/credentials/)
    expect(normalizeIdentifier('hostname', 'API.Example.COM.').normalized).toBe('api.example.com')
    expect(normalizeIdentifier('hostname', '10.0.0.1').error).toMatch(/IP address/)
    expect(normalizeIdentifier('ip_address', '2001:DB8::1').normalized).toBe('2001:db8::1')
    expect(normalizeIdentifier('ip_address', '10.0.0.0/8').normalized).toBe('10.0.0.0/8')
    expect(normalizeIdentifier('ip_address', '10.0.0.0/33').error).toBeTruthy()
    expect(normalizeIdentifier('ip_address', '999.1.1.1').error).toBeTruthy()
    for (const form of ['https://github.com/Northwind/API.git', 'git@github.com:northwind/api.git', 'github.com/northwind/api/']) {
      expect(normalizeIdentifier('repository', form).normalized).toBe('github.com/northwind/api')
    }
    expect(normalizeIdentifier('container_image', 'Registry.io/App:1.4').normalized).toBe('registry.io/app:1.4')
    expect(normalizeIdentifier('cloud_resource_id', 'arn:aws:s3:::Bucket').normalized).toBe('arn:aws:s3:::Bucket')
    expect(normalizeIdentifier('other', 'bad\u0000value').error).toMatch(/control/)
  })
})

describe('creating assets', () => {
  it('creates an organization-scoped asset with normalized data, server-set provenance and an audit event', async () => {
    const { client, orgId, userId } = await owner()
    const res = await client.post(BASE, assetPayload())
    expect(res.status).toBe(201)
    expect(res.body.asset).toMatchObject({
      name: 'Production API',
      type: 'api',
      typeLabel: 'API',
      environmentLabel: 'Production',
      criticality: 'critical',
      criticalityLabel: 'Critical',
      exposureLabel: 'Internet-facing',
      status: 'active',
      identifiers: [{ kind: 'url', kindLabel: 'URL', value: 'https://API.northwind.dev/' }],
      tags: ['pci', 'payments'],
      technologies: ['Node.js', 'Express'],
      owner: { team: 'Backend Team', contact: null, contactRemoved: false },
      discovery: { source: 'manual', sourceLabel: 'Manual entry', lastSeenAt: null },
      archived: false,
      revision: 1,
      createdBy: { id: userId, fullName: 'Olivia Owner' },
      actions: { update: true, archive: true, restore: false, delete: false },
    })
    const stored = await Asset.findById(res.body.asset.id).lean()
    expect(String(stored.organizationId)).toBe(orgId)
    expect(stored.identifierKeys).toEqual(['url:https://api.northwind.dev'])
    expect(stored.criticalityRank).toBe(4)
    expect(stored.discovery.firstSeenAt).toBeInstanceOf(Date)

    const audit = await AuditLog.findOne({ action: 'asset.create' }).lean()
    expect(audit).toMatchObject({ outcome: 'success', resourceType: 'asset' })
    expect(String(audit.resourceId)).toBe(res.body.asset.id)
    expect(audit.metadata.changes).toContainEqual({ field: 'criticality', from: null, to: 'critical' })
  })

  it('ignores server-controlled fields in the body', async () => {
    const { client } = await owner()
    const res = await client.post(BASE, {
      ...assetPayload(),
      organizationId: '0123456789abcdef01234567',
      archived: true,
      revision: 99,
      criticalityRank: 1,
      createdBy: '0123456789abcdef01234567',
      discovery: { source: 'scanner', externalId: 'x', lastSeenAt: '2020-01-01' },
    })
    expect(res.status).toBe(201)
    expect(res.body.asset).toMatchObject({ archived: false, revision: 1, discovery: { source: 'manual', lastSeenAt: null } })
    const stored = await Asset.findById(res.body.asset.id).lean()
    expect(stored.criticalityRank).toBe(4)
    expect(stored.discovery.externalId).toBeNull()
  })

  it('validates fields with messages per field (including nested identifier rows)', async () => {
    const { client } = await owner()
    const res = await client.post(BASE, {
      name: 'x',
      type: 'mainframe',
      environment: '',
      criticality: 'extreme',
      identifiers: [{ kind: 'url', value: 'ftp://files.example.com' }, { kind: 'teleport', value: 'x' }],
      tags: ['has space'],
      status: 'retired',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.fields).toMatchObject({
      name: 'Name must be at least 2 characters',
      type: 'Choose an asset type',
      environment: 'Choose an environment',
      criticality: 'Choose a criticality',
      'identifiers.1.kind': 'Choose an identifier type',
      'tags.0': 'Tags use letters, numbers and . _ : / -',
      status: 'New assets start as planned or active',
    })

    const kindSpecific = await client.post(BASE, assetPayload({ identifiers: [{ kind: 'url', value: 'ftp://files.example.com' }] }))
    expect(kindSpecific.status).toBe(400)
    expect(kindSpecific.body.error.fields['identifiers.0.value']).toBe('Use an http:// or https:// URL')

    const bounds = await client.post(BASE, assetPayload({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`), name: 'n'.repeat(121) }))
    expect(bounds.body.error.fields).toMatchObject({ tags: 'Use 20 tags or fewer', name: 'Name must be 120 characters or fewer' })

    const control = await client.post(BASE, assetPayload({ name: 'Evil\u0007Name' }))
    expect(control.body.error.fields.name).toBe('Remove control characters')

    const operator = await client.post(BASE, assetPayload({ name: { $gt: '' }, type: { $ne: null } }))
    expect(operator.status).toBe(400)
    expect(await Asset.countDocuments()).toBe(0)
  })

  it('rejects duplicate identifiers within an asset and across live assets in the organization', async () => {
    const { client } = await owner()
    const dupInside = await client.post(
      BASE,
      assetPayload({ identifiers: [{ kind: 'hostname', value: 'api.northwind.dev' }, { kind: 'hostname', value: 'API.northwind.dev.' }] }),
    )
    expect(dupInside.body.error.fields['identifiers.1.value']).toBe('This identifier is listed twice')

    expect((await client.post(BASE, assetPayload())).status).toBe(201)
    const clash = await client.post(
      BASE,
      assetPayload({ name: 'Other', identifiers: [{ kind: 'hostname', value: 'x.dev' }, { kind: 'url', value: 'https://api.northwind.dev' }] }),
    )
    expect(clash.status).toBe(409)
    expect(clash.body.error.code).toBe('ASSET_IDENTIFIER_EXISTS')
    expect(clash.body.error.fields).toEqual({ 'identifiers.1.value': 'Another asset already uses this identifier' })

    // Same value under a different kind is a different identifier.
    expect((await client.post(BASE, assetPayload({ name: 'Other', identifiers: [{ kind: 'other', value: 'https://api.northwind.dev' }] }))).status).toBe(201)
    // Names may repeat (e.g. the same service in two environments).
    expect((await client.post(BASE, assetPayload({ identifiers: [] }))).status).toBe(201)
  })

  it('holds the identifier constraint under concurrent creates', async () => {
    const { client } = await owner()
    const results = await Promise.all([1, 2, 3].map(() => client.post(BASE, assetPayload())))
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409])
    expect(await Asset.countDocuments()).toBe(1)
  })

  it('accepts an owner contact only if they are an active member of this organization', async () => {
    const { client, orgId } = await owner()
    const analyst = await memberOf(ctx, orgId, 'security_analyst', { fullName: 'Anna Analyst', workspace: 'Anna Personal' })
    const outsider = await signedInBrowser(ctx, { workspace: 'Outside' })

    const bad = await client.post(BASE, assetPayload({ owner: { team: 'x', contactUserId: outsider.session.user.id } }))
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields['owner.contactUserId']).toBe('Choose a current member of this organization')

    const ok = await client.post(BASE, assetPayload({ owner: { team: 'Backend', contactUserId: analyst.userId } }))
    expect(ok.status).toBe(201)
    expect(ok.body.asset.owner.contact).toEqual({ userId: analyst.userId, fullName: 'Anna Analyst' })
  })
})

describe('reading and updating', () => {
  it('updates with optimistic concurrency and records enumerated before/after values', async () => {
    const { client } = await owner()
    const { asset } = (await client.post(BASE, assetPayload())).body

    const updated = await client.patch(`${BASE}/${asset.id}`, {
      revision: 1,
      criticality: 'medium',
      name: 'Public API',
      tags: ['payments'],
      organizationId: '0123456789abcdef01234567',
    })
    expect(updated.status).toBe(200)
    expect(updated.body.asset).toMatchObject({ name: 'Public API', criticality: 'medium', tags: ['payments'], revision: 2 })

    const stale = await client.patch(`${BASE}/${asset.id}`, { revision: 1, name: 'Lost update' })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('ASSET_CONFLICT')
    expect((await client.get(`${BASE}/${asset.id}`)).body.asset.name).toBe('Public API')

    const missingRevision = await client.patch(`${BASE}/${asset.id}`, { name: 'No revision' })
    expect(missingRevision.status).toBe(400)
    const nothing = await client.patch(`${BASE}/${asset.id}`, { revision: 2 })
    expect(nothing.status).toBe(400)

    const audit = await AuditLog.findOne({ action: 'asset.update' }).lean()
    expect(audit.metadata.fields.sort()).toEqual(['criticality', 'name', 'tags'])
    expect(audit.metadata.changes).toEqual([{ field: 'criticality', from: 'critical', to: 'medium' }])
    expect((await Asset.findById(asset.id).lean()).criticalityRank).toBe(2)
  })

  it('only one of two concurrent edits from the same revision wins', async () => {
    const { client } = await owner()
    const { asset } = (await client.post(BASE, assetPayload())).body
    const results = await Promise.all([
      client.patch(`${BASE}/${asset.id}`, { revision: 1, name: 'Edit A' }),
      client.patch(`${BASE}/${asset.id}`, { revision: 1, name: 'Edit B' }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect((await Asset.findById(asset.id).lean()).revision).toBe(2)
  })

  it('enforces lifecycle transitions', async () => {
    const { client } = await owner()
    const { asset } = (await client.post(BASE, assetPayload({ status: 'planned', identifiers: [] }))).body
    const skip = await client.patch(`${BASE}/${asset.id}`, { revision: 1, status: 'deprecated' })
    expect(skip.status).toBe(400)
    expect(skip.body.error.fields.status).toBe("An asset can't move from Planned to Deprecated")

    let revision = 1
    for (const status of ['active', 'deprecated', 'retired', 'active']) {
      const res = await client.patch(`${BASE}/${asset.id}`, { revision, status })
      expect({ status, code: res.status }).toEqual({ status, code: 200 })
      revision = res.body.asset.revision
    }
  })

  it('treats identical values as a no-op and keeps partial owner updates', async () => {
    const { client, orgId } = await owner()
    const analyst = await memberOf(ctx, orgId, 'security_analyst', { workspace: 'Anna Personal' })
    const { asset } = (await client.post(BASE, assetPayload({ owner: { team: 'Backend', contactUserId: analyst.userId } }))).body

    const same = await client.patch(`${BASE}/${asset.id}`, { revision: 1, name: asset.name, tags: asset.tags })
    expect(same.body.asset.revision).toBe(1)

    const team = await client.patch(`${BASE}/${asset.id}`, { revision: 1, owner: { team: 'Platform' } })
    expect(team.body.asset.owner).toMatchObject({ team: 'Platform', contact: { userId: analyst.userId } })
    const cleared = await client.patch(`${BASE}/${asset.id}`, { revision: 2, owner: { contactUserId: null } })
    expect(cleared.body.asset.owner).toMatchObject({ team: 'Platform', contact: null, contactRemoved: false })
  })

  it('hides a contact who is no longer a member', async () => {
    const { client, orgId } = await owner()
    const analyst = await memberOf(ctx, orgId, 'security_analyst', { workspace: 'Anna Personal' })
    const { asset } = (await client.post(BASE, assetPayload({ owner: { team: '', contactUserId: analyst.userId } }))).body
    expect((await client.delete(`/api/organizations/current/members/${analyst.userId}`)).status).toBe(200)

    const read = await client.get(`${BASE}/${asset.id}`)
    expect(read.body.asset.owner).toEqual({ team: '', contact: null, contactRemoved: true })
  })
})

describe('archive, restore and delete', () => {
  it('archives (read-only), restores, and deletes only archived assets', async () => {
    const { client } = await owner()
    const { asset } = (await client.post(BASE, assetPayload())).body

    const notArchived = await client.delete(`${BASE}/${asset.id}`)
    expect(notArchived.status).toBe(409)
    expect(notArchived.body.error.code).toBe('ASSET_NOT_ARCHIVED')

    const archived = await client.post(`${BASE}/${asset.id}/archive`, { revision: 1 })
    expect(archived.status).toBe(200)
    expect(archived.body.asset).toMatchObject({ archived: true, archivedBy: { fullName: 'Olivia Owner' }, actions: { update: false, restore: true, delete: true } })

    const edit = await client.patch(`${BASE}/${asset.id}`, { revision: 2, name: 'Nope' })
    expect(edit.body.error.code).toBe('ASSET_ARCHIVED')
    expect((await client.post(`${BASE}/${asset.id}/archive`, {})).body.error.code).toBe('ASSET_ARCHIVED')

    // Archived assets free their identifiers; a restore must not collide with a replacement.
    const replacement = await client.post(BASE, assetPayload({ name: 'Replacement' }))
    expect(replacement.status).toBe(201)
    const blocked = await client.post(`${BASE}/${asset.id}/restore`, {})
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.code).toBe('ASSET_IDENTIFIER_EXISTS')

    await client.post(`${BASE}/${replacement.body.asset.id}/archive`, {})
    const restored = await client.post(`${BASE}/${asset.id}/restore`, {})
    expect(restored.status).toBe(200)
    expect(restored.body.asset).toMatchObject({ archived: false, archivedAt: null, archivedBy: null })

    await client.post(`${BASE}/${asset.id}/archive`, {})
    const deleted = await client.delete(`${BASE}/${asset.id}`)
    expect(deleted.status).toBe(200)
    expect(await Asset.exists({ _id: asset.id })).toBeNull()
    expect((await client.get(`${BASE}/${asset.id}`)).status).toBe(404)

    const actions = (await AuditLog.find({ resourceType: 'asset', resourceId: asset.id, outcome: 'success' }).sort({ createdAt: 1 }).lean()).map((a) => a.action)
    expect(actions).toEqual(['asset.create', 'asset.archive', 'asset.restore', 'asset.archive', 'asset.delete'])
  })

  it('rejects a stale revision on archive', async () => {
    const { client } = await owner()
    const { asset } = (await client.post(BASE, assetPayload())).body
    await client.patch(`${BASE}/${asset.id}`, { revision: 1, name: 'Changed' })
    expect((await client.post(`${BASE}/${asset.id}/archive`, { revision: 1 })).body.error.code).toBe('ASSET_CONFLICT')
  })
})
