import { describe, expect, it } from 'vitest'
import { AuditLog, AuthToken, Session, User } from '../src/models/index.js'
import {
  api,
  createVerifiedUser,
  signedInBrowser,
  signupPayload,
  tokenFromEmail,
  useTestApp,
} from './support/testApp.js'

const ctx = useTestApp()
const NEW_PASSWORD = 'Rotated-Credential-Phrase-77'

async function requestReset(email) {
  ctx.mailer.outbox.length = 0
  const res = await api(ctx.app).post('/api/auth/password/forgot', { email })
  expect(res.status).toBe(202)
  return tokenFromEmail(ctx.mailer, '/reset-password', email)
}

describe('POST /api/auth/password/forgot', () => {
  it('emails a reset link for an existing account', async () => {
    const user = await createVerifiedUser(ctx)
    const token = await requestReset(user.email)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await AuditLog.countDocuments({ action: 'auth.password.reset_request' })).toBe(1)
  })

  it('responds identically for unknown emails and sends nothing', async () => {
    const user = await createVerifiedUser(ctx)
    ctx.mailer.outbox.length = 0
    const known = await api(ctx.app).post('/api/auth/password/forgot', { email: user.email })
    const unknown = await api(ctx.app).post('/api/auth/password/forgot', { email: 'ghost@acme.io' })
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    await ctx.mailer.idle()
    expect(ctx.mailer.outbox.filter((m) => m.to === 'ghost@acme.io')).toHaveLength(0)
  })

  it('rate limits repeated requests for the same email', async () => {
    const user = await createVerifiedUser(ctx)
    for (let i = 0; i < 3; i++) {
      expect((await api(ctx.app).post('/api/auth/password/forgot', { email: user.email })).status).toBe(202)
    }
    const res = await api(ctx.app).post('/api/auth/password/forgot', { email: user.email })
    expect(res.status).toBe(429)
    expect(res.body.error.scope).toBe('account')
  })
})

describe('POST /api/auth/password/reset/validate', () => {
  it('accepts a live token without consuming it', async () => {
    const user = await createVerifiedUser(ctx)
    const token = await requestReset(user.email)
    for (let i = 0; i < 2; i++) {
      const res = await api(ctx.app).post('/api/auth/password/reset/validate', { token })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ valid: true })
    }
  })

  it('distinguishes expired from invalid links', async () => {
    const user = await createVerifiedUser(ctx)
    const token = await requestReset(user.email)
    await AuthToken.updateMany({ purpose: 'password_reset' }, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const expired = await api(ctx.app).post('/api/auth/password/reset/validate', { token })
    expect(expired.status).toBe(410)
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED')

    const invalid = await api(ctx.app).post('/api/auth/password/reset/validate', { token: 'B'.repeat(43) })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('TOKEN_INVALID')
  })

  it('only the most recent link works', async () => {
    const user = await createVerifiedUser(ctx)
    const first = await requestReset(user.email)
    const second = await requestReset(user.email)
    expect((await api(ctx.app).post('/api/auth/password/reset/validate', { token: first })).body.error.code).toBe('TOKEN_INVALID')
    expect((await api(ctx.app).post('/api/auth/password/reset/validate', { token: second })).status).toBe(200)
  })

  it('does not accept a verification token as a reset token', async () => {
    const payload = signupPayload()
    await api(ctx.app).post('/api/auth/signup', payload)
    const verificationToken = await tokenFromEmail(ctx.mailer, '/verify-email', payload.email)
    const res = await api(ctx.app).post('/api/auth/password/reset/validate', { token: verificationToken })
    expect(res.body.error.code).toBe('TOKEN_INVALID')
  })
})

describe('POST /api/auth/password/reset', () => {
  it('changes the password, revokes every session and invalidates the token', async () => {
    const { user, client } = await signedInBrowser(ctx)
    expect((await client.get('/api/auth/session')).status).toBe(200)
    const token = await requestReset(user.email)

    const res = await api(ctx.app).post('/api/auth/password/reset', { token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, sessionsRevoked: true })

    expect(await Session.countDocuments()).toBe(0)
    expect((await client.get('/api/auth/session')).status).toBe(401)

    const oldLogin = await api(ctx.app).post('/api/auth/login', { email: user.email, password: user.password })
    expect(oldLogin.body.error.code).toBe('INVALID_CREDENTIALS')
    const newLogin = await api(ctx.app).post('/api/auth/login', { email: user.email, password: NEW_PASSWORD })
    expect(newLogin.status).toBe(200)

    const reuse = await api(ctx.app).post('/api/auth/password/reset', { token, password: 'Another-Long-Password-99' })
    expect(reuse.body.error.code).toBe('TOKEN_INVALID')

    await ctx.mailer.idle()
    expect(ctx.mailer.outbox.some((m) => m.subject.includes('password was changed'))).toBe(true)
    expect(await AuditLog.countDocuments({ action: 'auth.password.reset', outcome: 'success' })).toBe(1)
  })

  it('rejects a weak password without consuming the link', async () => {
    const user = await createVerifiedUser(ctx, { fullName: 'Grace Hopper' })
    const token = await requestReset(user.email)

    const weak = await api(ctx.app).post('/api/auth/password/reset', { token, password: 'short' })
    expect(weak.status).toBe(400)
    expect(weak.body.error.fields.password).toBe('Use at least 12 characters')

    const personal = await api(ctx.app).post('/api/auth/password/reset', { token, password: 'hopper-password-2026' })
    expect(personal.body.error.fields.password).toBe("Don't include your name or email")

    expect((await api(ctx.app).post('/api/auth/password/reset', { token, password: NEW_PASSWORD })).status).toBe(200)
  })

  it('rejects an expired token', async () => {
    const user = await createVerifiedUser(ctx)
    const token = await requestReset(user.email)
    await AuthToken.updateMany({ purpose: 'password_reset' }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await api(ctx.app).post('/api/auth/password/reset', { token, password: NEW_PASSWORD })
    expect(res.status).toBe(410)
    expect(res.body.error.code).toBe('TOKEN_EXPIRED')
  })

  it('verifies the email of an unverified account (reset proves inbox control) and lifts a login lockout', async () => {
    const payload = signupPayload()
    await api(ctx.app).post('/api/auth/signup', payload)
    for (let i = 0; i < 5; i++) await api(ctx.app).post('/api/auth/login', { email: payload.email, password: 'wrong-password-000' })
    expect((await api(ctx.app).post('/api/auth/login', { email: payload.email, password: payload.password })).status).toBe(429)

    const token = await requestReset(payload.email)
    expect((await api(ctx.app).post('/api/auth/password/reset', { token, password: NEW_PASSWORD })).status).toBe(200)
    expect((await User.findOne().lean()).emailVerifiedAt).toBeInstanceOf(Date)
    expect((await api(ctx.app).post('/api/auth/login', { email: payload.email, password: NEW_PASSWORD })).status).toBe(200)
  })
})
