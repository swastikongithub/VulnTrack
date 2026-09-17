import { describe, expect, it } from 'vitest'
import { Asset } from '../src/models/index.js'
import { signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()
const BASE = '/api/organizations/current/assets'

async function ownerWithInventory() {
  const owner = await signedInBrowser(ctx, { workspace: 'Northwind' })
  const create = (body) => owner.client.post(BASE, body).then((r) => {
    expect({ status: r.status, error: r.body.error }).toEqual({ status: 201, error: undefined })
    return r.body.asset
  })
  const seed = [
    { name: 'Payments API', type: 'api', environment: 'production', criticality: 'critical', exposure: 'internet_facing', tags: ['pci', 'payments'], technologies: ['Go'], owner: { team: 'Payments' }, identifiers: [{ kind: 'hostname', value: 'pay.northwind.dev' }] },
    { name: 'admin portal', type: 'web_application', environment: 'production', criticality: 'high', exposure: 'internal', tags: ['internal'], technologies: ['React'], owner: { team: 'Platform' } },
    { name: 'Customer DB', type: 'database', environment: 'production', criticality: 'critical', exposure: 'internal', tags: ['pci'], technologies: ['PostgreSQL'] },
    { name: 'Build Runner', type: 'server', environment: 'development', criticality: 'low', status: 'planned', technologies: ['Ubuntu'] },
    { name: 'Staging API', type: 'api', environment: 'staging', criticality: 'medium', exposure: 'internet_facing', identifiers: [{ kind: 'url', value: 'https://staging.northwind.dev' }] },
    { name: 'api-gateway (legacy)', type: 'api', environment: 'production', criticality: 'medium', tags: ['legacy'] },
  ]
  const assets = []
  for (const body of seed) assets.push(await create(body))
  await owner.client.post(`${BASE}/${assets[5].id}/archive`, {})
  return { ...owner, assets }
}

const names = (res) => res.body.assets.map((a) => a.name)

describe('GET /organizations/:id/assets', () => {
  it('lists live assets by name (case-insensitive) with pagination metadata; archived ones separately', async () => {
    const { client } = await ownerWithInventory()
    const res = await client.get(BASE)
    expect(res.status).toBe(200)
    expect(names(res)).toEqual(['admin portal', 'Build Runner', 'Customer DB', 'Payments API', 'Staging API'])
    expect(res.body).toMatchObject({ page: 1, pageSize: 25, total: 5, totalPages: 1, sort: 'name', order: 'asc' })

    const archived = await client.get(`${BASE}?archived=true`)
    expect(names(archived)).toEqual(['api-gateway (legacy)'])
  })

  it('searches name, identifiers, tags, technologies and team — literally, never as a pattern', async () => {
    const { client } = await ownerWithInventory()
    expect(names(await client.get(`${BASE}?q=api`))).toEqual(['Payments API', 'Staging API'])
    expect(names(await client.get(`${BASE}?q=pay.northwind`))).toEqual(['Payments API'])
    expect(names(await client.get(`${BASE}?q=POSTGRES`))).toEqual(['Customer DB'])
    expect(names(await client.get(`${BASE}?q=platform`))).toEqual(['admin portal'])
    // Regex metacharacters are escaped: ".*" matches nothing rather than everything; "(" doesn't throw.
    expect((await client.get(`${BASE}?q=${encodeURIComponent('.*')}`)).body.total).toBe(0)
    const paren = await client.get(`${BASE}?q=${encodeURIComponent('(legacy')}&archived=true`)
    expect(paren.status).toBe(200)
    expect(names(paren)).toEqual(['api-gateway (legacy)'])
    expect((await client.get(`${BASE}?q=${'a'.repeat(101)}`)).status).toBe(400)
  })

  it('filters by multiple values and combines filters', async () => {
    const { client } = await ownerWithInventory()
    expect(names(await client.get(`${BASE}?criticality=critical,high`))).toEqual(['admin portal', 'Customer DB', 'Payments API'])
    expect(names(await client.get(`${BASE}?type=api&environment=production`))).toEqual(['Payments API'])
    expect(names(await client.get(`${BASE}?exposure=internet_facing`))).toEqual(['Payments API', 'Staging API'])
    expect(names(await client.get(`${BASE}?status=planned`))).toEqual(['Build Runner'])
    expect(names(await client.get(`${BASE}?tag=PCI`))).toEqual(['Customer DB', 'Payments API'])
    expect(names(await client.get(`${BASE}?tag=pci&q=customer`))).toEqual(['Customer DB'])
  })

  it('sorts by criticality order and other fields with stable tie-breaks', async () => {
    const { client } = await ownerWithInventory()
    expect(names(await client.get(`${BASE}?sort=criticality`))).toEqual(['Customer DB', 'Payments API', 'admin portal', 'Staging API', 'Build Runner'])
    expect(names(await client.get(`${BASE}?sort=criticality&order=asc`))).toEqual(['Build Runner', 'Staging API', 'admin portal', 'Customer DB', 'Payments API'])
    expect(names(await client.get(`${BASE}?sort=type`))[0]).toBe('Payments API')
    const updated = await client.get(`${BASE}?sort=updatedAt`)
    expect(updated.body.order).toBe('desc')
    expect(names(updated)[0]).toBe('Staging API')
  })

  it('paginates server-side', async () => {
    const owner = await signedInBrowser(ctx, { workspace: 'Big Corp' })
    const organizationId = owner.session.organization.id
    const userId = owner.session.user.id
    await Asset.insertMany(
      Array.from({ length: 53 }, (_, i) => ({
        organizationId,
        name: `Asset ${String(i).padStart(2, '0')}`,
        type: 'server',
        environment: 'production',
        criticality: 'low',
        criticalityRank: 1,
        createdBy: userId,
        updatedBy: userId,
      })),
    )
    const page3 = await owner.client.get(`${BASE}?pageSize=20&page=3`)
    expect(page3.body).toMatchObject({ total: 53, totalPages: 3, page: 3 })
    expect(names(page3)).toEqual(['Asset 40', 'Asset 41', 'Asset 42', 'Asset 43', 'Asset 44', 'Asset 45', 'Asset 46', 'Asset 47', 'Asset 48', 'Asset 49', 'Asset 50', 'Asset 51', 'Asset 52'])
    expect((await owner.client.get(`${BASE}?page=9`)).body.assets).toEqual([])
  })

  it('rejects invalid query parameters instead of guessing', async () => {
    const { client } = await ownerWithInventory()
    const cases = [
      ['type=mainframe', 'type'],
      ['criticality=critical,extreme', 'criticality'],
      ['sort=password', 'sort'],
      ['order=sideways', 'order'],
      ['page=0', 'page'],
      ['pageSize=500', 'pageSize'],
      ['archived=maybe', 'archived'],
      ['type=api&type=server', 'type'], // repeated keys become arrays: rejected
      ['tag=bad tag', 'tag'],
    ]
    for (const [query, field] of cases) {
      const res = await client.get(`${BASE}?${query}`)
      expect({ query, status: res.status, field: Object.keys(res.body.error.fields)[0] }).toEqual({ query, status: 400, field })
    }
    // Operator-style keys are just unknown parameters.
    expect((await client.get(`${BASE}?name[$ne]=x&$where=1`)).status).toBe(200)
  })
})

describe('GET /organizations/:id/assets/summary', () => {
  it('counts the live inventory by criticality, environment, exposure and tag', async () => {
    const { client } = await ownerWithInventory()
    const res = await client.get(`${BASE}/summary`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      total: 5,
      archived: 1,
      internetFacing: 2,
      byCriticality: { critical: 2, high: 1, medium: 1, low: 1 },
      byEnvironment: { production: 3, staging: 1, development: 1, test: 0, other: 0 },
      tags: [
        { tag: 'pci', count: 2 },
        { tag: 'internal', count: 1 },
        { tag: 'payments', count: 1 },
      ],
    })
  })
})
