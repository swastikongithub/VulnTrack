import { describe, expect, it } from 'vitest'
import { roleHasPermission, ROLES, ROLE_VALUES } from '../src/config/roles.js'
import { Membership, Organization, User } from '../src/models/index.js'
import { api, signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()

describe('authorization boundary', () => {
  it('requires authentication for tenant endpoints', async () => {
    for (const url of ['/api/organizations', '/api/organizations/000000000000000000000000']) {
      const res = await api(ctx.app).get(url)
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('lets a member read their own organization', async () => {
    const { client, session } = await signedInBrowser(ctx)
    const res = await client.get(`/api/organizations/${session.organization.id}`)
    expect(res.status).toBe(200)
    expect(res.body.organization.name).toBe('Acme Security')
    expect(res.body.membership.role).toBe('owner')
  })
})

describe('organization isolation', () => {
  it('hides other organizations entirely (404, not 403)', async () => {
    const alice = await signedInBrowser(ctx, { fullName: 'Alice Analyst', workspace: 'Alpha Corp' })
    const bob = await signedInBrowser(ctx, { fullName: 'Bob Builder', workspace: 'Beta Corp' })

    for (const path of ['', '/members']) {
      const crossTenant = await alice.client.get(`/api/organizations/${bob.session.organization.id}${path}`)
      expect(crossTenant.status).toBe(404)
      expect(crossTenant.body.error.code).toBe('NOT_FOUND')
    }

    const nonexistent = await alice.client.get('/api/organizations/0123456789abcdef01234567')
    const malformed = await alice.client.get('/api/organizations/not-an-id')
    expect(nonexistent.status).toBe(404)
    expect(malformed.status).toBe(404)
    // Existing-but-foreign and nonexistent organizations are indistinguishable.
    expect(nonexistent.body.error.message).toBe(
      (await alice.client.get(`/api/organizations/${bob.session.organization.id}`)).body.error.message,
    )
  })

  it("lists only the caller's memberships and members", async () => {
    const alice = await signedInBrowser(ctx, { fullName: 'Alice Analyst', workspace: 'Alpha Corp' })
    await signedInBrowser(ctx, { fullName: 'Bob Builder', workspace: 'Beta Corp' })

    const mine = await alice.client.get('/api/organizations')
    expect(mine.body.memberships).toHaveLength(1)
    expect(mine.body.memberships[0].organization.name).toBe('Alpha Corp')

    const members = await alice.client.get(`/api/organizations/${alice.session.organization.id}/members`)
    expect(members.status).toBe(200)
    expect(members.body.members.map((m) => m.fullName)).toEqual(['Alice Analyst'])
  })

  it('stops honoring a membership once it is suspended', async () => {
    const alice = await signedInBrowser(ctx)
    await Membership.updateMany({}, { $set: { status: 'suspended' } })
    expect((await alice.client.get(`/api/organizations/${alice.session.organization.id}`)).status).toBe(404)
  })
})

describe('role-based permissions', () => {
  it('enforces member visibility by role within the same organization', async () => {
    const owner = await signedInBrowser(ctx, { fullName: 'Olivia Owner', workspace: 'Gamma Corp' })
    const viewer = await signedInBrowser(ctx, { fullName: 'Victor Viewer', workspace: 'Viewer Personal' })
    const analyst = await signedInBrowser(ctx, { fullName: 'Andrea Analyst', workspace: 'Analyst Personal' })

    const orgId = owner.session.organization.id
    const userId = async (email) => (await User.findOne({ emailNormalized: email.toLowerCase() }).lean())._id
    await Membership.create([
      { organizationId: orgId, userId: await userId(viewer.user.email), role: ROLES.VIEWER },
      { organizationId: orgId, userId: await userId(analyst.user.email), role: ROLES.SECURITY_ANALYST },
    ])

    const viewerOrg = await viewer.client.get(`/api/organizations/${orgId}`)
    expect(viewerOrg.status).toBe(200)
    expect(viewerOrg.body.membership.role).toBe('viewer')

    const viewerMembers = await viewer.client.get(`/api/organizations/${orgId}/members`)
    expect(viewerMembers.status).toBe(403)
    expect(viewerMembers.body.error.code).toBe('FORBIDDEN')

    const analystMembers = await analyst.client.get(`/api/organizations/${orgId}/members`)
    expect(analystMembers.status).toBe(200)
    expect(analystMembers.body.members).toHaveLength(3)

    expect(await Organization.countDocuments()).toBe(3)
  })

  it('permission map follows the conceptual matrix', () => {
    expect(ROLE_VALUES).toEqual(['owner', 'admin', 'security_analyst', 'developer', 'viewer'])
    // Phase 3 split the coarse members:manage permission into invite / update_role / remove.
    for (const permission of ['members:invite', 'members:update_role', 'members:remove']) {
      expect(roleHasPermission('owner', permission)).toBe(true)
      expect(roleHasPermission('admin', permission)).toBe(true)
      expect(roleHasPermission('security_analyst', permission)).toBe(false)
    }
    expect(roleHasPermission('owner', 'members:manage')).toBe(false)
    expect(roleHasPermission('security_analyst', 'members:read')).toBe(true)
    expect(roleHasPermission('developer', 'members:read')).toBe(false)
    expect(roleHasPermission('viewer', 'organization:update')).toBe(false)
    expect(roleHasPermission('unknown-role', 'organization:read')).toBe(false)
  })
})
