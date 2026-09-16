import { describe, expect, it } from 'vitest'
import { AuditLog, AuthToken, Membership, Organization, User } from '../src/models/index.js'
import { api, signupPayload, STRONG_PASSWORD, tokenFromEmail, useTestApp } from './support/testApp.js'

const ctx = useTestApp()

describe('POST /api/auth/signup', () => {
  it('creates the user, organization and owner membership, and emails a verification link', async () => {
    const payload = signupPayload({ email: 'Ada.Morgan@Acme.io' })
    const res = await api(ctx.app).post('/api/auth/signup', payload)

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ email: 'ada.morgan@acme.io', verificationRequired: true })

    const user = await User.findOne({ emailNormalized: 'ada.morgan@acme.io' }).select('+passwordHash').lean()
    expect(user.fullName).toBe('Ada Morgan')
    expect(user.email).toBe('Ada.Morgan@Acme.io')
    expect(user.emailVerifiedAt).toBeNull()
    // Argon2id PHC string — never the plaintext.
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(user.passwordHash).not.toContain(STRONG_PASSWORD)

    const organization = await Organization.findOne({ createdBy: user._id }).lean()
    expect(organization.name).toBe('Acme Security')
    expect(organization.slug).toMatch(/^acme-security-[a-f0-9]{6}$/)

    const membership = await Membership.findOne({ userId: user._id }).lean()
    expect(String(membership.organizationId)).toBe(String(organization._id))
    expect(membership.role).toBe('owner')

    const token = await tokenFromEmail(ctx.mailer, '/verify-email', payload.email)
    // Only a digest is stored.
    const stored = await AuthToken.findOne({ userId: user._id }).lean()
    expect(stored.tokenHash).not.toBe(token)
    expect(stored.purpose).toBe('email_verification')

    expect(await AuditLog.countDocuments({ action: 'auth.signup', outcome: 'success' })).toBe(1)
  })

  it('responds identically for an email that already has an account, without creating another', async () => {
    const payload = signupPayload()
    const first = await api(ctx.app).post('/api/auth/signup', payload)
    const second = await api(ctx.app).post('/api/auth/signup', { ...payload, email: payload.email.toUpperCase(), workspace: 'Other' })

    expect(second.status).toBe(first.status)
    expect(second.body).toEqual(first.body)
    expect(await User.countDocuments()).toBe(1)
    expect(await Organization.countDocuments()).toBe(1)

    await ctx.mailer.idle()
    const notice = ctx.mailer.outbox.find((m) => m.subject.includes('tried to create'))
    expect(notice).toBeTruthy()
    expect(notice.text).not.toMatch(/token=/)
  })

  it('rejects invalid input with field-level errors', async () => {
    const res = await api(ctx.app).post('/api/auth/signup', {
      fullName: 'A',
      email: 'not-an-email',
      workspace: '',
      password: '',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(res.body.error.fields).toMatchObject({
      fullName: 'Name must be at least 2 characters',
      email: 'Enter a valid email, like name@company.com',
      workspace: 'Name your workspace',
      password: 'Create a password',
    })
    expect(await User.countDocuments()).toBe(0)
  })

  it('enforces the password policy on the server', async () => {
    const short = await api(ctx.app).post('/api/auth/signup', signupPayload({ password: 'short', confirmPassword: 'short' }))
    expect(short.status).toBe(400)
    expect(short.body.error.fields.password).toBe('Use at least 12 characters')

    const personal = await api(ctx.app).post(
      '/api/auth/signup',
      signupPayload({ email: 'morgan@acme.io', password: 'morgan-rocks-1234', confirmPassword: 'morgan-rocks-1234' }),
    )
    expect(personal.status).toBe(400)
    expect(personal.body.error.fields.password).toBe("Don't include your name or email")

    const mismatch = await api(ctx.app).post('/api/auth/signup', signupPayload({ confirmPassword: 'something-else-entirely' }))
    expect(mismatch.status).toBe(400)
    expect(mismatch.body.error.fields.confirmPassword).toBe("Passwords don't match")
    expect(await User.countDocuments()).toBe(0)
  })

  it('ignores unexpected fields and operator payloads', async () => {
    const res = await api(ctx.app).post('/api/auth/signup', {
      ...signupPayload(),
      email: { $gt: '' },
    })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.email).toBeDefined()

    const ok = await api(ctx.app).post('/api/auth/signup', { ...signupPayload(), emailVerifiedAt: new Date(), role: 'owner' })
    expect(ok.status).toBe(202)
    const user = await User.findOne().lean()
    expect(user.emailVerifiedAt).toBeNull()
  })
})
