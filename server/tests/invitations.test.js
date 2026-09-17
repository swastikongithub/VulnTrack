import { describe, expect, it } from 'vitest'
import { AuditLog, Invitation, Membership, RateLimit } from '../src/models/index.js'
import { hashToken } from '../src/utils/crypto.js'
import { api, memberOf, signedInBrowser, tokenFromEmail, useTestApp, userIdOf } from './support/testApp.js'

const ctx = useTestApp()

const INVITEE = 'new.analyst@alpha.io'

async function alphaOwner() {
  const owner = await signedInBrowser(ctx, { fullName: 'Olivia Owner', workspace: 'Alpha Corp' })
  return { ...owner, orgId: owner.session.organization.id, userId: owner.session.user.id }
}

async function invite(client, body = {}) {
  ctx.mailer.outbox.length = 0
  const res = await client.post('/api/organizations/current/invitations', { email: INVITEE, role: 'security_analyst', ...body })
  const token = res.status === 201 ? await tokenFromEmail(ctx.mailer, '/invite', body.email ?? INVITEE) : null
  return { res, token }
}

describe('creating invitations', () => {
  it('lets an owner invite by email; stores only a token digest and emails the link', async () => {
    const owner = await alphaOwner()
    const { res, token } = await invite(owner.client, { email: 'New.Analyst@Alpha.io' })

    expect(res.status).toBe(201)
    expect(res.body.invitation).toMatchObject({
      email: 'New.Analyst@Alpha.io',
      role: 'security_analyst',
      roleLabel: 'Security Analyst',
      status: 'pending',
      invitedBy: { fullName: 'Olivia Owner' },
      actions: { resend: true, revoke: true },
    })
    expect(JSON.stringify(res.body)).not.toContain(token)

    const stored = await Invitation.findById(res.body.invitation.id).lean()
    expect(stored.emailNormalized).toBe('new.analyst@alpha.io')
    expect(stored.tokenHash).toBe(hashToken(token))
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600e3)

    const email = ctx.mailer.outbox.at(-1)
    expect(email.subject).toBe('Olivia Owner invited you to Alpha Corp on VulnTrack')
    expect(email.text).toContain('as Security Analyst')

    const audit = await AuditLog.findOne({ action: 'organization.invitation.create' }).lean()
    expect(audit).toMatchObject({ outcome: 'success', metadata: { role: 'security_analyst' } })
    expect(audit.subjectFingerprint).toMatch(/^[a-f0-9]{32}$/)
    expect(JSON.stringify(audit)).not.toMatch(/alpha\.io|token/i)
  })

  it('limits which roles each role may invite', async () => {
    const owner = await alphaOwner()
    const admin = await memberOf(ctx, owner.orgId, 'admin', { workspace: 'Admin Personal' })
    const analyst = await memberOf(ctx, owner.orgId, 'security_analyst', { workspace: 'Analyst Personal' })
    const viewer = await memberOf(ctx, owner.orgId, 'viewer', { workspace: 'Viewer Personal' })

    expect((await invite(admin.client, { email: 'dev@alpha.io', role: 'developer' })).res.status).toBe(201)
    for (const role of ['admin', 'owner']) {
      const { res } = await invite(admin.client, { email: `${role}@alpha.io`, role })
      expect(res.status).toBe(403)
      expect(res.body.error.message).toBe("You can't invite someone with that role.")
    }
    expect((await invite(owner.client, { email: 'co-owner@alpha.io', role: 'owner' })).res.status).toBe(201)

    for (const who of [analyst, viewer]) {
      const { res } = await invite(who.client, { email: 'sneaky@alpha.io', role: 'viewer' })
      expect(res.status).toBe(403)
      expect((await who.client.get('/api/organizations/current/invitations')).status).toBe(403)
    }
    expect(await Invitation.countDocuments()).toBe(2)
    expect(await AuditLog.countDocuments({ action: /invitation\.create|authorization\.denied/, outcome: 'failure' })).toBe(4)
  })

  it('prevents duplicate pending invitations, including under concurrency', async () => {
    const owner = await alphaOwner()
    expect((await invite(owner.client)).res.status).toBe(201)

    const again = await invite(owner.client, { email: INVITEE.toUpperCase(), role: 'viewer' })
    expect(again.res.status).toBe(409)
    expect(again.res.body.error.code).toBe('INVITATION_EXISTS')

    const parallel = await Promise.all(
      [1, 2, 3].map(() => owner.client.post('/api/organizations/current/invitations', { email: 'race@alpha.io', role: 'viewer' })),
    )
    expect(parallel.map((r) => r.status).sort()).toEqual([201, 409, 409])
    expect(await Invitation.countDocuments({ emailNormalized: 'race@alpha.io', status: 'pending' })).toBe(1)
  })

  it('refuses to invite existing members and validates input', async () => {
    const owner = await alphaOwner()
    const member = await memberOf(ctx, owner.orgId, 'viewer', { workspace: 'Member Personal' })

    const existing = await invite(owner.client, { email: member.user.email })
    expect(existing.res.status).toBe(409)
    expect(existing.res.body.error.code).toBe('ALREADY_MEMBER')

    const bad = await owner.client.post('/api/organizations/current/invitations', { email: 'nope', role: 'superuser' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.fields).toMatchObject({ email: 'Enter a valid email, like name@company.com', role: 'Choose a role' })
  })

  it('replaces an expired invitation instead of blocking a new one', async () => {
    const owner = await alphaOwner()
    const first = await invite(owner.client)
    await Invitation.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const listed = await owner.client.get('/api/organizations/current/invitations')
    expect(listed.body.invitations[0].status).toBe('expired')

    const second = await invite(owner.client)
    expect(second.res.status).toBe(201)
    expect((await Invitation.findById(first.res.body.invitation.id).lean()).status).toBe('expired')
  })
})

describe('inspecting an invitation link', () => {
  it('describes a valid link to the token holder without authentication', async () => {
    const owner = await alphaOwner()
    const { token } = await invite(owner.client)
    const res = await api(ctx.app).post('/api/invitations/inspect', { token })
    expect(res.status).toBe(200)
    expect(res.body.invitation).toMatchObject({
      email: INVITEE,
      role: 'security_analyst',
      roleLabel: 'Security Analyst',
      organization: { id: owner.orgId, name: 'Alpha Corp' },
      invitedBy: { fullName: 'Olivia Owner' },
    })
  })

  it('distinguishes invalid, expired and revoked links', async () => {
    const owner = await alphaOwner()
    for (const token of ['', 'short', 'A'.repeat(43)]) {
      const res = await api(ctx.app).post('/api/invitations/inspect', { token })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('TOKEN_INVALID')
    }
    expect((await api(ctx.app).post('/api/invitations/inspect', { token: { $ne: null } })).status).toBe(400)

    const { res, token } = await invite(owner.client)
    await Invitation.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const expired = await api(ctx.app).post('/api/invitations/inspect', { token })
    expect(expired.status).toBe(410)
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED')

    await Invitation.updateMany({}, { $set: { expiresAt: new Date(Date.now() + 3600e3) } })
    expect((await owner.client.delete(`/api/organizations/current/invitations/${res.body.invitation.id}`)).status).toBe(200)
    expect((await api(ctx.app).post('/api/invitations/inspect', { token })).body.error.code).toBe('TOKEN_INVALID')
  })
})

describe('accepting invitations', () => {
  it('adds the matching account with the invited role and makes it the current organization', async () => {
    const owner = await alphaOwner()
    const { res: created, token } = await invite(owner.client)
    const invitee = await signedInBrowser(ctx, { fullName: 'Nina Newhire', email: INVITEE, workspace: 'Nina Personal' })

    const accepted = await invitee.client.post('/api/invitations/accept', { token })
    expect(accepted.status).toBe(200)
    expect(accepted.body.organization).toMatchObject({ id: owner.orgId, name: 'Alpha Corp' })
    expect(accepted.body.membership).toEqual({ role: 'security_analyst', roleLabel: 'Security Analyst' })
    expect(accepted.body.permissions).toContain('members:read')
    expect(accepted.body.memberships.map((m) => [m.organization.name, m.current])).toEqual([
      ['Nina Personal', false],
      ['Alpha Corp', true],
    ])

    const userId = await userIdOf(INVITEE)
    expect((await Membership.findOne({ organizationId: owner.orgId, userId }).lean()).role).toBe('security_analyst')
    expect((await Invitation.findById(created.body.invitation.id).lean()).status).toBe('accepted')
    expect((await invitee.client.get('/api/organizations/current')).body.organization.name).toBe('Alpha Corp')
    expect(await AuditLog.countDocuments({ action: 'organization.invitation.accept', outcome: 'success' })).toBe(1)

    // Single use: the same link can't be accepted again or inspected.
    const reuse = await invitee.client.post('/api/invitations/accept', { token })
    expect(reuse.status).toBe(400)
    expect(reuse.body.error.code).toBe('TOKEN_INVALID')
  })

  it('assigns the role from the invitation, never from the request', async () => {
    const owner = await alphaOwner()
    const { token } = await invite(owner.client, { role: 'viewer' })
    const invitee = await signedInBrowser(ctx, { email: INVITEE, workspace: 'Nina Personal' })
    const res = await invitee.client.post('/api/invitations/accept', {
      token,
      role: 'owner',
      organizationId: '0123456789abcdef01234567',
    })
    expect(res.status).toBe(200)
    expect(res.body.membership.role).toBe('viewer')
  })

  it('rejects an account with a different email and keeps the invitation usable', async () => {
    const owner = await alphaOwner()
    const { token } = await invite(owner.client)
    const stranger = await signedInBrowser(ctx, { email: 'someone.else@alpha.io', workspace: 'Stranger Personal' })

    const res = await stranger.client.post('/api/invitations/accept', { token })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('INVITATION_EMAIL_MISMATCH')
    expect(await Membership.countDocuments({ organizationId: owner.orgId })).toBe(1)
    expect(await AuditLog.countDocuments({ action: 'organization.invitation.accept', reason: 'email_mismatch' })).toBe(1)

    const invitee = await signedInBrowser(ctx, { email: INVITEE, workspace: 'Nina Personal' })
    expect((await invitee.client.post('/api/invitations/accept', { token })).status).toBe(200)
  })

  it('requires a signed-in account and rejects expired links', async () => {
    const owner = await alphaOwner()
    const { token } = await invite(owner.client)
    expect((await api(ctx.app).post('/api/invitations/accept', { token })).status).toBe(401)

    await Invitation.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const invitee = await signedInBrowser(ctx, { email: INVITEE, workspace: 'Nina Personal' })
    const res = await invitee.client.post('/api/invitations/accept', { token })
    expect(res.status).toBe(410)
    expect(res.body.error.code).toBe('TOKEN_EXPIRED')
    expect(await Membership.countDocuments({ organizationId: owner.orgId })).toBe(1)
  })

  it('refuses when the account is already a member', async () => {
    const owner = await alphaOwner()
    const { token } = await invite(owner.client)
    const invitee = await signedInBrowser(ctx, { email: INVITEE, workspace: 'Nina Personal' })
    await Membership.create({ organizationId: owner.orgId, userId: await userIdOf(INVITEE), role: 'viewer' })

    const res = await invitee.client.post('/api/invitations/accept', { token })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ALREADY_MEMBER')
    expect((await Membership.findOne({ organizationId: owner.orgId, userId: await userIdOf(INVITEE) }).lean()).role).toBe('viewer')
  })

  it('only one of two concurrent accepts succeeds', async () => {
    const owner = await alphaOwner()
    const { token } = await invite(owner.client)
    const invitee = await signedInBrowser(ctx, { email: INVITEE, workspace: 'Nina Personal' })
    const results = await Promise.all([1, 2].map(() => invitee.client.post('/api/invitations/accept', { token })))
    expect(results.map((r) => r.status).sort()).toEqual([200, expect.any(Number)])
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(await Membership.countDocuments({ organizationId: owner.orgId })).toBe(2)
  })

  it('invalidates invitations whose inviter lost the authority to grant the role', async () => {
    const owner = await alphaOwner()
    const admin = await memberOf(ctx, owner.orgId, 'admin', { workspace: 'Admin Personal' })
    const { res, token } = await invite(admin.client, { role: 'developer' })
    expect(res.status).toBe(201)

    // Demoting the admin revokes the invitations they could no longer create.
    expect((await owner.client.patch(`/api/organizations/current/members/${admin.userId}`, { role: 'viewer' })).status).toBe(200)
    expect((await Invitation.findById(res.body.invitation.id).lean()).status).toBe('revoked')

    const invitee = await signedInBrowser(ctx, { email: INVITEE, workspace: 'Nina Personal' })
    expect((await invitee.client.post('/api/invitations/accept', { token })).body.error.code).toBe('TOKEN_INVALID')

    // Defense in depth: even if revocation had been missed, acceptance re-checks the inviter.
    await Invitation.updateOne({ _id: res.body.invitation.id }, { $set: { status: 'pending' } })
    const late = await invitee.client.post('/api/invitations/accept', { token })
    expect(late.body.error.code).toBe('TOKEN_INVALID')
    expect(await AuditLog.countDocuments({ reason: 'inviter_authority_lost' })).toBe(1)
    expect(await Membership.countDocuments({ organizationId: owner.orgId })).toBe(2)
  })
})

describe('managing pending invitations', () => {
  it('resend issues a new link and invalidates the old one, with a cooldown', async () => {
    const owner = await alphaOwner()
    const { res, token: oldToken } = await invite(owner.client)
    ctx.mailer.outbox.length = 0

    const resent = await owner.client.post(`/api/organizations/current/invitations/${res.body.invitation.id}/resend`)
    expect(resent.status).toBe(200)
    const newToken = await tokenFromEmail(ctx.mailer, '/invite', INVITEE)
    expect(newToken).not.toBe(oldToken)
    expect((await api(ctx.app).post('/api/invitations/inspect', { token: oldToken })).body.error.code).toBe('TOKEN_INVALID')
    expect((await api(ctx.app).post('/api/invitations/inspect', { token: newToken })).status).toBe(200)
    expect((await Invitation.findById(res.body.invitation.id).lean()).sendCount).toBe(2)

    const tooSoon = await owner.client.post(`/api/organizations/current/invitations/${res.body.invitation.id}/resend`)
    expect(tooSoon.status).toBe(429)
    expect(tooSoon.body.error.retryAfter).toBeGreaterThan(0)
    expect(await AuditLog.countDocuments({ action: 'organization.invitation.resend', outcome: 'success' })).toBe(1)
  })

  it('revoke makes the link unusable and removes it from the pending list', async () => {
    const owner = await alphaOwner()
    const { res, token } = await invite(owner.client)
    const revoked = await owner.client.delete(`/api/organizations/current/invitations/${res.body.invitation.id}`)
    expect(revoked.status).toBe(200)
    expect((await owner.client.get('/api/organizations/current/invitations')).body.invitations).toEqual([])

    const invitee = await signedInBrowser(ctx, { email: INVITEE, workspace: 'Nina Personal' })
    expect((await invitee.client.post('/api/invitations/accept', { token })).body.error.code).toBe('TOKEN_INVALID')
    expect((await owner.client.delete(`/api/organizations/current/invitations/${res.body.invitation.id}`)).status).toBe(404)
    expect(await AuditLog.countDocuments({ action: 'organization.invitation.revoke', outcome: 'success' })).toBe(1)
  })

  it("admins can't resend or revoke invitations for roles they can't grant", async () => {
    const owner = await alphaOwner()
    const admin = await memberOf(ctx, owner.orgId, 'admin', { workspace: 'Admin Personal' })
    const { res } = await invite(owner.client, { email: 'co-owner@alpha.io', role: 'owner' })

    const listed = await admin.client.get('/api/organizations/current/invitations')
    expect(listed.body.invitations[0].actions).toEqual({ resend: false, revoke: false })
    expect((await admin.client.post(`/api/organizations/current/invitations/${res.body.invitation.id}/resend`)).status).toBe(403)
    expect((await admin.client.delete(`/api/organizations/current/invitations/${res.body.invitation.id}`)).status).toBe(403)
    expect((await Invitation.findById(res.body.invitation.id).lean()).status).toBe('pending')
  })

  it("keeps other tenants' invitations invisible and unmanageable", async () => {
    const alpha = await alphaOwner()
    const { res } = await invite(alpha.client)
    await RateLimit.deleteMany({})
    const beta = await signedInBrowser(ctx, { fullName: 'Bob Brandt', workspace: 'Beta Corp' })
    const invitationId = res.body.invitation.id

    const attempts = [
      beta.client.get(`/api/organizations/${alpha.orgId}/invitations`),
      beta.client.post(`/api/organizations/${alpha.orgId}/invitations`, { email: 'x@alpha.io', role: 'owner' }),
      beta.client.post(`/api/organizations/${alpha.orgId}/invitations/${invitationId}/resend`),
      beta.client.delete(`/api/organizations/${alpha.orgId}/invitations/${invitationId}`),
      beta.client.post(`/api/organizations/current/invitations/${invitationId}/resend`),
      beta.client.delete(`/api/organizations/current/invitations/${invitationId}`),
    ]
    for (const r of await Promise.all(attempts)) {
      expect(r.status).toBe(404)
      expect(r.body.error.code).toBe('NOT_FOUND')
    }
    expect((await beta.client.get('/api/organizations/current/invitations')).body.invitations).toEqual([])
    expect((await Invitation.findById(invitationId).lean()).status).toBe('pending')
  })
})
