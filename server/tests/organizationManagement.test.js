import { describe, expect, it } from 'vitest'
import { AuditLog, Invitation, Membership, Organization } from '../src/models/index.js'
import { api, memberOf, signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()

/** One organization with a member of every role, each with its own signed-in client. */
async function team() {
  const owner = await signedInBrowser(ctx, { fullName: 'Olivia Owner', workspace: 'Alpha Corp' })
  const orgId = owner.session.organization.id
  owner.userId = owner.session.user.id
  const admin = await memberOf(ctx, orgId, 'admin', { fullName: 'Adam Admin', workspace: 'Adam Personal' })
  const analyst = await memberOf(ctx, orgId, 'security_analyst', { fullName: 'Anna Analyst', workspace: 'Anna Personal' })
  const developer = await memberOf(ctx, orgId, 'developer', { fullName: 'Dev Developer', workspace: 'Dev Personal' })
  const viewer = await memberOf(ctx, orgId, 'viewer', { fullName: 'Vera Viewer', workspace: 'Vera Personal' })
  return { orgId, owner, admin, analyst, developer, viewer }
}

const roleOf = async (orgId, userId) => (await Membership.findOne({ organizationId: orgId, userId }).lean())?.role

describe('current organization', () => {
  it('returns the organization with the caller role, permissions and assignable roles', async () => {
    const { orgId, owner, admin, viewer } = await team()

    const asOwner = await owner.client.get('/api/organizations/current')
    expect(asOwner.status).toBe(200)
    expect(asOwner.body.organization).toMatchObject({ id: orgId, name: 'Alpha Corp', memberCount: 5 })
    expect(asOwner.body.membership).toEqual({ role: 'owner', roleLabel: 'Owner' })
    expect(asOwner.body.permissions).toContain('members:update_role')
    expect(asOwner.body.assignableRoles.map((r) => r.value)).toEqual(['owner', 'admin', 'security_analyst', 'developer', 'viewer'])

    const asAdmin = await admin.client.get('/api/organizations/current')
    expect(asAdmin.body.assignableRoles.map((r) => r.value)).toEqual(['security_analyst', 'developer', 'viewer'])

    const asViewer = await viewer.client.get(`/api/organizations/${orgId}`)
    expect(asViewer.status).toBe(200)
    expect(asViewer.body.permissions).not.toContain('organization:update')
    expect(asViewer.body.assignableRoles).toEqual([])
  })

  it('requires a session for every organization endpoint', async () => {
    const requests = [
      api(ctx.app).get('/api/organizations/current'),
      api(ctx.app).patch('/api/organizations/current', { name: 'X Corp' }),
      api(ctx.app).get('/api/organizations/current/members'),
      api(ctx.app).get('/api/organizations/current/members/0123456789abcdef01234567'),
      api(ctx.app).patch('/api/organizations/current/members/0123456789abcdef01234567', { role: 'viewer' }),
      api(ctx.app).delete('/api/organizations/current/members/0123456789abcdef01234567'),
      api(ctx.app).get('/api/organizations/current/invitations'),
      api(ctx.app).post('/api/organizations/current/invitations', { email: 'a@b.co', role: 'viewer' }),
      api(ctx.app).post('/api/organizations/switch', { organizationId: '0123456789abcdef01234567' }),
      api(ctx.app).post('/api/invitations/accept', { token: 'A'.repeat(43) }),
    ]
    for (const res of await Promise.all(requests)) {
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects state-changing organization requests without an allowed Origin (CSRF)', async () => {
    const { owner } = await signedInBrowser(ctx).then((o) => ({ owner: o }))
    const patch = await owner.client.agent.patch('/api/organizations/current').send({ name: 'Evil Corp' })
    expect(patch.status).toBe(403)
    expect(patch.body.error.code).toBe('CSRF_REJECTED')
    const del = await owner.client.agent
      .delete(`/api/organizations/current/members/${owner.session.user.id}`)
      .set('Origin', 'https://evil.example')
    expect(del.status).toBe(403)
    expect(del.body.error.code).toBe('CSRF_REJECTED')
    expect((await Organization.findOne().lean()).name).toBe('Acme Security')
  })
})

describe('PATCH /organizations/:id (settings)', () => {
  it('lets owners and admins rename the organization and records it', async () => {
    const { orgId, owner, admin } = await team()

    const byOwner = await owner.client.patch('/api/organizations/current', { name: '  Alpha Security  ' })
    expect(byOwner.status).toBe(200)
    expect(byOwner.body.organization.name).toBe('Alpha Security')

    const byAdmin = await admin.client.patch(`/api/organizations/${orgId}`, { name: 'Alpha Labs' })
    expect(byAdmin.status).toBe(200)
    expect((await Organization.findById(orgId).lean()).name).toBe('Alpha Labs')

    const audits = await AuditLog.find({ action: 'organization.update', outcome: 'success' }).lean()
    expect(audits).toHaveLength(2)
    expect(audits[0].metadata.fields).toEqual(['name'])
  })

  it('refuses analysts, developers and viewers, and audits the denial', async () => {
    const { orgId, analyst, developer, viewer } = await team()
    for (const who of [analyst, developer, viewer]) {
      const res = await who.client.patch('/api/organizations/current', { name: 'Hijacked' })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    }
    expect((await Organization.findById(orgId).lean()).name).toBe('Alpha Corp')
    expect(await AuditLog.countDocuments({ action: 'authorization.denied', reason: 'missing_permission' })).toBe(3)
  })

  it('ignores fields other than the name and validates it', async () => {
    const { owner } = await signedInBrowser(ctx).then((o) => ({ owner: o }))
    const before = await Organization.findOne().lean()

    const tampered = await owner.client.patch('/api/organizations/current', {
      name: 'Renamed',
      slug: 'taken-over',
      createdBy: '0123456789abcdef01234567',
      rosterVersion: -1,
    })
    expect(tampered.status).toBe(200)
    const after = await Organization.findOne().lean()
    expect(after).toMatchObject({ name: 'Renamed', slug: before.slug, createdBy: before.createdBy, rosterVersion: 0 })

    const invalid = await owner.client.patch('/api/organizations/current', { name: 'x' })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.fields.name).toBe('Workspace name must be at least 2 characters')
    const operator = await owner.client.patch('/api/organizations/current', { name: { $gt: '' } })
    expect(operator.status).toBe(400)
  })
})

describe('members', () => {
  it('lists members for owners, admins and analysts only, with server-derived actions', async () => {
    const { owner, admin, analyst, developer, viewer } = await team()

    for (const who of [developer, viewer]) {
      expect((await who.client.get('/api/organizations/current/members')).status).toBe(403)
    }

    const asOwner = await owner.client.get('/api/organizations/current/members')
    expect(asOwner.status).toBe(200)
    expect(asOwner.body.members.map((x) => x.role)).toEqual(['owner', 'admin', 'security_analyst', 'developer', 'viewer'])
    const ownRow = asOwner.body.members.find((x) => x.isCurrentUser)
    expect(ownRow.actions).toEqual({ updateRole: false, remove: false })
    expect(asOwner.body.members.filter((x) => !x.isCurrentUser).every((x) => x.actions.updateRole && x.actions.remove)).toBe(true)

    const asAdmin = await admin.client.get('/api/organizations/current/members')
    const byRole = Object.fromEntries(asAdmin.body.members.map((x) => [x.role, x.actions]))
    expect(byRole.owner).toEqual({ updateRole: false, remove: false })
    expect(byRole.admin).toEqual({ updateRole: false, remove: false }) // self
    expect(byRole.developer).toEqual({ updateRole: true, remove: true })

    const asAnalyst = await analyst.client.get('/api/organizations/current/members')
    expect(asAnalyst.status).toBe(200)
    expect(asAnalyst.body.members.every((x) => !x.actions.updateRole && !x.actions.remove)).toBe(true)
  })

  it('returns one member by id, and 404 for users outside the organization', async () => {
    const { admin, developer } = await team()
    const outsider = await signedInBrowser(ctx, { workspace: 'Outside Corp' })

    const found = await admin.client.get(`/api/organizations/current/members/${developer.userId}`)
    expect(found.status).toBe(200)
    expect(found.body.member).toMatchObject({ fullName: 'Dev Developer', role: 'developer' })

    for (const id of [outsider.session.user.id, 'not-an-id', 'aaaaaaaaaaaa']) {
      const res = await admin.client.get(`/api/organizations/current/members/${id}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    }
  })
})

describe('changing roles', () => {
  it('lets an admin move members between roles below admin, and audits it', async () => {
    const { orgId, admin, developer } = await team()
    const res = await admin.client.patch(`/api/organizations/current/members/${developer.userId}`, {
      role: 'security_analyst',
    })
    expect(res.status).toBe(200)
    expect(res.body.member).toMatchObject({ role: 'security_analyst', roleLabel: 'Security Analyst' })
    expect(await roleOf(orgId, developer.userId)).toBe('security_analyst')

    const audit = await AuditLog.findOne({ action: 'organization.member.role_change', outcome: 'success' }).lean()
    expect(String(audit.targetUserId)).toBe(developer.userId)
    expect(audit.metadata).toMatchObject({ previousRole: 'developer', role: 'security_analyst' })

    // The change takes effect on the member's very next request.
    expect((await developer.client.get('/api/organizations/current/members')).status).toBe(200)
  })

  it('prevents vertical escalation by every non-owner role', async () => {
    const { orgId, owner, admin, analyst, developer, viewer } = await team()
    const attempts = [
      [viewer, viewer.userId, 'owner'], // self-escalation without permission
      [developer, developer.userId, 'admin'],
      [analyst, viewer.userId, 'security_analyst'], // analysts can read members, not manage them
      [admin, admin.userId, 'owner'], // self-escalation with permission
      [admin, viewer.userId, 'admin'], // granting own level
      [admin, viewer.userId, 'owner'], // granting above own level
      [admin, owner.userId, 'viewer'], // demoting a higher role
    ]
    for (const [actor, target, role] of attempts) {
      const res = await actor.client.patch(`/api/organizations/current/members/${target}`, { role })
      expect(res.status, `${role} for ${target}`).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    }
    const roles = await Membership.find({ organizationId: orgId }).lean()
    expect(roles.map((r) => r.role).sort()).toEqual(['admin', 'developer', 'owner', 'security_analyst', 'viewer'])
    expect(await AuditLog.countDocuments({ action: /member\.role_change|authorization\.denied/, outcome: 'failure' })).toBe(7)
  })

  it('stops an admin from managing another admin (horizontal escalation)', async () => {
    const { orgId, admin } = await team()
    const secondAdmin = await memberOf(ctx, orgId, 'admin', { fullName: 'Second Admin', workspace: 'Second' })
    const demote = await admin.client.patch(`/api/organizations/current/members/${secondAdmin.userId}`, { role: 'viewer' })
    expect(demote.status).toBe(403)
    const remove = await admin.client.delete(`/api/organizations/current/members/${secondAdmin.userId}`)
    expect(remove.status).toBe(403)
    expect(await roleOf(orgId, secondAdmin.userId)).toBe('admin')
  })

  it('takes the role only from the validated body and the target only from the URL', async () => {
    const { orgId, owner, admin, viewer } = await team()
    const res = await admin.client.patch(`/api/organizations/current/members/${viewer.userId}`, {
      role: 'developer',
      userId: owner.userId,
      organizationId: '0123456789abcdef01234567',
      permissions: ['members:remove'],
    })
    expect(res.status).toBe(200)
    expect(await roleOf(orgId, viewer.userId)).toBe('developer')
    expect(await roleOf(orgId, owner.userId)).toBe('owner')

    for (const role of ['superuser', 'OWNER', '', null, ['owner'], { $ne: 'viewer' }]) {
      const bad = await owner.client.patch(`/api/organizations/current/members/${viewer.userId}`, { role })
      expect(bad.status).toBe(400)
      expect(bad.body.error.fields.role).toBe('Choose a role')
    }
  })

  it('lets owners appoint and demote other owners', async () => {
    const { orgId, owner, admin } = await team()
    expect((await owner.client.patch(`/api/organizations/current/members/${admin.userId}`, { role: 'owner' })).status).toBe(200)
    expect(await roleOf(orgId, admin.userId)).toBe('owner')
    // The new owner can now manage the original owner.
    expect((await admin.client.patch(`/api/organizations/current/members/${owner.userId}`, { role: 'admin' })).status).toBe(200)
    expect(await roleOf(orgId, owner.userId)).toBe('admin')
  })
})

describe('owner protection', () => {
  it('never lets the only owner give up ownership', async () => {
    const { orgId, owner } = await team()
    const res = await owner.client.patch(`/api/organizations/current/members/${owner.userId}`, { role: 'admin' })
    expect(res.status).toBe(403)
    const leave = await owner.client.delete(`/api/organizations/current/members/${owner.userId}`)
    expect(leave.status).toBe(403)
    expect(await Membership.countDocuments({ organizationId: orgId, role: 'owner' })).toBe(1)
  })

  it('keeps at least one owner when two owners demote each other at the same time', async () => {
    const { orgId, owner, admin } = await team()
    await owner.client.patch(`/api/organizations/current/members/${admin.userId}`, { role: 'owner' })

    const [first, second] = await Promise.all([
      owner.client.patch(`/api/organizations/current/members/${admin.userId}`, { role: 'admin' }),
      admin.client.patch(`/api/organizations/current/members/${owner.userId}`, { role: 'admin' }),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses[0]).toBe(200)
    expect(statuses[1]).toBeGreaterThanOrEqual(403)
    expect(await Membership.countDocuments({ organizationId: orgId, role: 'owner', status: 'active' })).toBe(1)
  })

  it('keeps at least one owner when two owners remove each other at the same time', async () => {
    const { orgId, owner, admin } = await team()
    await owner.client.patch(`/api/organizations/current/members/${admin.userId}`, { role: 'owner' })

    await Promise.all([
      owner.client.delete(`/api/organizations/current/members/${admin.userId}`),
      admin.client.delete(`/api/organizations/current/members/${owner.userId}`),
    ])
    expect(await Membership.countDocuments({ organizationId: orgId, role: 'owner', status: 'active' })).toBe(1)
  })
})

describe('removing members', () => {
  it('lets an admin remove a lower member; access ends immediately', async () => {
    const { orgId, admin, analyst } = await team()
    const res = await admin.client.delete(`/api/organizations/current/members/${analyst.userId}`)
    expect(res.status).toBe(200)
    expect(await Membership.exists({ organizationId: orgId, userId: analyst.userId })).toBeNull()

    // The removed member keeps their session, but not this organization.
    expect((await analyst.client.get(`/api/organizations/${orgId}`)).status).toBe(404)
    const current = await analyst.client.get('/api/organizations/current')
    expect(current.status).toBe(200)
    expect(current.body.organization.name).toBe('Anna Personal')

    const audit = await AuditLog.findOne({ action: 'organization.member.remove', outcome: 'success' }).lean()
    expect(audit.metadata.previousRole).toBe('security_analyst')
  })

  it('refuses removal by roles without the permission or of higher roles', async () => {
    const { orgId, owner, admin, analyst, developer } = await team()
    expect((await analyst.client.delete(`/api/organizations/current/members/${developer.userId}`)).status).toBe(403)
    expect((await developer.client.delete(`/api/organizations/current/members/${analyst.userId}`)).status).toBe(403)
    expect((await admin.client.delete(`/api/organizations/current/members/${owner.userId}`)).status).toBe(403)
    expect((await admin.client.delete(`/api/organizations/current/members/${admin.userId}`)).status).toBe(403)
    expect(await Membership.countDocuments({ organizationId: orgId })).toBe(5)
  })

  it("revokes the removed member's pending invitations", async () => {
    const { owner, admin } = await team()
    const created = await admin.client.post('/api/organizations/current/invitations', {
      email: 'new.hire@alpha.io',
      role: 'developer',
    })
    expect(created.status).toBe(201)

    expect((await owner.client.delete(`/api/organizations/current/members/${admin.userId}`)).status).toBe(200)
    expect((await Invitation.findById(created.body.invitation.id).lean()).status).toBe('revoked')
  })
})

describe('tenant isolation for management actions', () => {
  it("User A can't read or manipulate User B's organization or members by id tampering", async () => {
    const alice = await signedInBrowser(ctx, { fullName: 'Alice Anders', workspace: 'Alpha Corp' })
    const bob = await signedInBrowser(ctx, { fullName: 'Bob Brandt', workspace: 'Beta Corp' })
    const betaId = bob.session.organization.id
    const bobId = bob.session.user.id
    const aliceId = alice.session.user.id

    const attempts = [
      alice.client.get(`/api/organizations/${betaId}`),
      alice.client.patch(`/api/organizations/${betaId}`, { name: 'Owned' }),
      alice.client.get(`/api/organizations/${betaId}/members`),
      alice.client.get(`/api/organizations/${betaId}/members/${bobId}`),
      alice.client.patch(`/api/organizations/${betaId}/members/${bobId}`, { role: 'viewer' }),
      alice.client.delete(`/api/organizations/${betaId}/members/${bobId}`),
      alice.client.patch(`/api/organizations/${betaId}/members/${aliceId}`, { role: 'owner' }),
      // Bob's user id against Alice's own organization: not a member there.
      alice.client.get(`/api/organizations/current/members/${bobId}`),
      alice.client.patch(`/api/organizations/current/members/${bobId}`, { role: 'viewer' }),
      alice.client.delete(`/api/organizations/current/members/${bobId}`),
    ]
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    }

    expect((await Organization.findById(betaId).lean()).name).toBe('Beta Corp')
    expect(await Membership.countDocuments({ organizationId: betaId })).toBe(1)
    expect(await Membership.exists({ organizationId: betaId, userId: aliceId })).toBeNull()
  })
})
