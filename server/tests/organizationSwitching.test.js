import { describe, expect, it } from 'vitest'
import { AuditLog, Membership, Session } from '../src/models/index.js'
import { browser, signedInBrowser, useTestApp, userIdOf } from './support/testApp.js'

const ctx = useTestApp()

/** Riley owns "Riley Personal" and is a developer in "Northwind". */
async function twoOrganizations() {
  const northwind = await signedInBrowser(ctx, { fullName: 'Nora North', workspace: 'Northwind' })
  const riley = await signedInBrowser(ctx, { fullName: 'Riley Chen', workspace: 'Riley Personal' })
  const northwindId = northwind.session.organization.id
  await Membership.create({ organizationId: northwindId, userId: await userIdOf(riley.user.email), role: 'developer' })
  return { riley, northwindId, personalId: riley.session.organization.id, northwind }
}

describe('POST /api/organizations/switch', () => {
  it('lists every membership with the current one marked', async () => {
    const { riley } = await twoOrganizations()
    const session = await riley.client.get('/api/auth/session')
    expect(session.body.memberships.map((m) => [m.organization.name, m.roleLabel, m.current])).toEqual([
      ['Riley Personal', 'Owner', true],
      ['Northwind', 'Developer', false],
    ])
    const listed = await riley.client.get('/api/organizations')
    expect(listed.body.memberships.map((m) => m.current)).toEqual([true, false])
  })

  it('switches the current organization for this session, with that role and permissions', async () => {
    const { riley, northwindId } = await twoOrganizations()

    const res = await riley.client.post('/api/organizations/switch', { organizationId: northwindId })
    expect(res.status).toBe(200)
    expect(res.body.organization).toMatchObject({ id: northwindId, name: 'Northwind' })
    expect(res.body.membership).toEqual({ role: 'developer', roleLabel: 'Developer' })
    expect(res.body.permissions).not.toContain('members:read')

    // Server-side state, not a client claim: every later request sees the new context.
    const current = await riley.client.get('/api/organizations/current')
    expect(current.body.organization.name).toBe('Northwind')
    expect((await riley.client.get('/api/organizations/current/members')).status).toBe(403)
    expect((await riley.client.get('/api/auth/session')).body.organization.name).toBe('Northwind')
    expect(String((await Session.findOne({ userId: await userIdOf(riley.user.email) }).lean()).activeOrganizationId)).toBe(northwindId)

    expect(await AuditLog.countDocuments({ action: 'organization.switch', outcome: 'success' })).toBe(1)
  })

  it('is per session: other devices keep their own current organization', async () => {
    const { riley, northwindId } = await twoOrganizations()
    const tablet = browser(ctx.app)
    expect((await tablet.post('/api/auth/login', { email: riley.user.email, password: riley.user.password })).status).toBe(200)

    await riley.client.post('/api/organizations/switch', { organizationId: northwindId })
    expect((await tablet.get('/api/organizations/current')).body.organization.name).toBe('Riley Personal')
  })

  it('refuses organizations the user does not belong to, and forged ids', async () => {
    const { riley } = await twoOrganizations()
    const outsider = await signedInBrowser(ctx, { workspace: 'Outsider Corp' })

    for (const organizationId of [outsider.session.organization.id, '0123456789abcdef01234567', 'not-an-id', 'aaaaaaaaaaaa']) {
      const res = await riley.client.post('/api/organizations/switch', { organizationId })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    }
    for (const organizationId of [{ $ne: null }, ['x'], 42, undefined]) {
      expect((await riley.client.post('/api/organizations/switch', { organizationId })).status).toBe(400)
    }
    expect((await riley.client.get('/api/organizations/current')).body.organization.name).toBe('Riley Personal')
    expect(await AuditLog.countDocuments({ action: 'organization.switch', outcome: 'failure', reason: 'not_a_member' })).toBe(4)
  })

  it('refuses switching into a suspended membership', async () => {
    const { riley, northwindId } = await twoOrganizations()
    await Membership.updateOne({ organizationId: northwindId, userId: await userIdOf(riley.user.email) }, { $set: { status: 'suspended' } })
    expect((await riley.client.post('/api/organizations/switch', { organizationId: northwindId })).status).toBe(404)
  })
})

describe('current organization resolution', () => {
  it('falls back to a remaining membership when the current one is removed', async () => {
    const { riley, northwindId, northwind } = await twoOrganizations()
    await riley.client.post('/api/organizations/switch', { organizationId: northwindId })

    const rileyId = String(await userIdOf(riley.user.email))
    expect((await northwind.client.delete(`/api/organizations/current/members/${rileyId}`)).status).toBe(200)

    const current = await riley.client.get('/api/organizations/current')
    expect(current.status).toBe(200)
    expect(current.body.organization.name).toBe('Riley Personal')
    expect((await riley.client.get('/api/auth/session')).body.memberships).toHaveLength(1)
    // The stale preference was corrected on the session.
    expect(String((await Session.findOne({ userId: rileyId }).lean()).activeOrganizationId)).toBe(current.body.organization.id)
  })

  it('reports no current organization for a user without memberships', async () => {
    const lonely = await signedInBrowser(ctx)
    await Membership.deleteMany({})
    const current = await lonely.client.get('/api/organizations/current')
    expect(current.status).toBe(404)
    const session = await lonely.client.get('/api/auth/session')
    expect(session.status).toBe(200)
    expect(session.body).toMatchObject({ organization: null, membership: null, permissions: [], memberships: [] })
  })
})
