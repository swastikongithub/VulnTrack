import { describe, expect, it } from 'vitest'
import { AuthToken, RateLimit, User } from '../src/models/index.js'
import { api, signupPayload, tokenFromEmail, useTestApp } from './support/testApp.js'

const ctx = useTestApp()

async function signup(overrides) {
  const payload = signupPayload(overrides)
  await api(ctx.app).post('/api/auth/signup', payload)
  const token = await tokenFromEmail(ctx.mailer, '/verify-email', payload.email)
  return { payload, token }
}

/** The signup starts a 60s resend cooldown; tests that resend clear it. */
const clearResendCooldown = () => RateLimit.deleteMany({ key: /^verification-resend-interval/ })

describe('POST /api/auth/email/verify', () => {
  it('verifies the email once and allows sign-in', async () => {
    const { payload, token } = await signup()

    const res = await api(ctx.app).post('/api/auth/email/verify', { token })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ verified: true })
    expect((await User.findOne().lean()).emailVerifiedAt).toBeInstanceOf(Date)

    const login = await api(ctx.app).post('/api/auth/login', { email: payload.email, password: payload.password })
    expect(login.status).toBe(200)

    // One-time use.
    const reuse = await api(ctx.app).post('/api/auth/email/verify', { token })
    expect(reuse.status).toBe(400)
    expect(reuse.body.error.code).toBe('TOKEN_INVALID')
  })

  it('reports an expired link distinctly', async () => {
    const { token } = await signup()
    await AuthToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const res = await api(ctx.app).post('/api/auth/email/verify', { token })
    expect(res.status).toBe(410)
    expect(res.body.error.code).toBe('TOKEN_EXPIRED')
    expect((await User.findOne().lean()).emailVerifiedAt).toBeNull()
  })

  it('rejects unknown or malformed tokens as invalid', async () => {
    for (const token of ['not-a-token', 'A'.repeat(43), '']) {
      const res = await api(ctx.app).post('/api/auth/email/verify', { token })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('TOKEN_INVALID')
    }
    const wrongType = await api(ctx.app).post('/api/auth/email/verify', { token: { $ne: null } })
    expect(wrongType.status).toBe(400)
  })
})

describe('POST /api/auth/email/resend', () => {
  it('sends a fresh link and invalidates the previous one', async () => {
    const { payload, token: oldToken } = await signup()
    await clearResendCooldown()
    ctx.mailer.outbox.length = 0

    const res = await api(ctx.app).post('/api/auth/email/resend', { email: payload.email })
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ ok: true, cooldown: 60 })

    const newToken = await tokenFromEmail(ctx.mailer, '/verify-email', payload.email)
    expect(newToken).not.toBe(oldToken)
    expect((await api(ctx.app).post('/api/auth/email/verify', { token: oldToken })).body.error.code).toBe('TOKEN_INVALID')
    expect((await api(ctx.app).post('/api/auth/email/verify', { token: newToken })).status).toBe(200)
  })

  it('responds identically for unknown and already-verified emails without sending mail', async () => {
    const { payload, token } = await signup()
    await api(ctx.app).post('/api/auth/email/verify', { token })
    await clearResendCooldown()
    ctx.mailer.outbox.length = 0

    const verified = await api(ctx.app).post('/api/auth/email/resend', { email: payload.email })
    const unknown = await api(ctx.app).post('/api/auth/email/resend', { email: 'ghost@acme.io' })
    expect(verified.status).toBe(202)
    expect(unknown.status).toBe(202)
    expect(verified.body).toEqual(unknown.body)
    await ctx.mailer.idle()
    expect(ctx.mailer.outbox).toHaveLength(0)
  })

  it('enforces the resend cooldown with a retry countdown', async () => {
    const { payload } = await signup()
    // Signup already started the cooldown window.
    const res = await api(ctx.app).post('/api/auth/email/resend', { email: payload.email })
    expect(res.status).toBe(429)
    expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED', scope: 'account' })
    expect(res.body.error.retryAfter).toBeGreaterThan(0)
    expect(res.body.error.retryAfter).toBeLessThanOrEqual(60)
  })
})
