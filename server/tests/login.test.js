import { describe, expect, it } from 'vitest'
import { AuditLog, Session } from '../src/models/index.js'
import { api, browser, createVerifiedUser, signupPayload, useTestApp } from './support/testApp.js'

const ctx = useTestApp()

const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('vt_session='))

describe('POST /api/auth/login', () => {
  it('establishes a server-side session in an httpOnly cookie and returns the tenant context', async () => {
    const user = await createVerifiedUser(ctx)
    const res = await api(ctx.app).post('/api/auth/login', { email: user.email, password: user.password })

    expect(res.status).toBe(200)
    const cookie = cookieOf(res)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
    expect(cookie).toMatch(/Path=\//)
    expect(cookie).not.toMatch(/Expires=/) // not "remember me" → browser-session cookie

    expect(res.body.user).toMatchObject({ fullName: 'Ada Morgan', email: user.email, emailVerified: true })
    expect(res.body.organization).toMatchObject({ name: 'Acme Security' })
    expect(res.body.membership).toEqual({ role: 'owner', roleLabel: 'Owner' })
    expect(res.body.session.persistent).toBe(false)
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash/)

    // The cookie value is not stored — only its digest.
    const raw = cookie.split(';')[0].split('=')[1]
    expect(await Session.countDocuments({ tokenHash: raw })).toBe(0)
    expect(await Session.countDocuments()).toBe(1)
    expect(await AuditLog.countDocuments({ action: 'auth.login', outcome: 'success' })).toBe(1)
  })

  it('sets a persistent cookie when "keep me signed in" is chosen', async () => {
    const user = await createVerifiedUser(ctx)
    const res = await api(ctx.app).post('/api/auth/login', { email: user.email, password: user.password, remember: true })
    expect(res.status).toBe(200)
    expect(cookieOf(res)).toMatch(/Expires=/)
    expect(res.body.session.persistent).toBe(true)
  })

  it('returns one generic error for a wrong password and for an unknown account', async () => {
    const user = await createVerifiedUser(ctx)
    const wrong = await api(ctx.app).post('/api/auth/login', { email: user.email, password: 'not-the-password-123' })
    const unknown = await api(ctx.app).post('/api/auth/login', { email: 'nobody@acme.io', password: 'not-the-password-123' })

    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
      expect(res.body.error.message).toBe('Email or password is incorrect.')
      expect(cookieOf(res)).toBeUndefined()
    }
    expect(await Session.countDocuments()).toBe(0)
  })

  it('refuses unverified accounts only after the correct password', async () => {
    const payload = signupPayload()
    await api(ctx.app).post('/api/auth/signup', payload)

    const wrong = await api(ctx.app).post('/api/auth/login', { email: payload.email, password: 'not-the-password-123' })
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS')

    const right = await api(ctx.app).post('/api/auth/login', { email: payload.email, password: payload.password })
    expect(right.status).toBe(403)
    expect(right.body.error.code).toBe('EMAIL_NOT_VERIFIED')
    expect(cookieOf(right)).toBeUndefined()
  })

  it('locks an account key after repeated failures, including for the correct password', async () => {
    const user = await createVerifiedUser(ctx)
    const attempt = (password) => api(ctx.app).post('/api/auth/login', { email: user.email, password })

    for (let i = 0; i < 4; i++) expect((await attempt('wrong-password-000')).body.error.code).toBe('INVALID_CREDENTIALS')

    const fifth = await attempt('wrong-password-000')
    expect(fifth.status).toBe(429)
    expect(fifth.body.error).toMatchObject({ code: 'RATE_LIMITED', scope: 'account' })
    expect(fifth.body.error.retryAfter).toBeGreaterThan(0)
    expect(fifth.headers['retry-after']).toBe(String(fifth.body.error.retryAfter))

    const correct = await attempt(user.password)
    expect(correct.status).toBe(429)

    // Another account is unaffected.
    const other = await createVerifiedUser(ctx)
    expect((await api(ctx.app).post('/api/auth/login', { email: other.email, password: other.password })).status).toBe(200)
  })

  it('applies the same lockout to emails that have no account (no enumeration)', async () => {
    const attempt = () => api(ctx.app).post('/api/auth/login', { email: 'ghost@acme.io', password: 'wrong-password-000' })
    for (let i = 0; i < 4; i++) await attempt()
    const res = await attempt()
    expect(res.status).toBe(429)
    expect(res.body.error.scope).toBe('account')
  })

  it('clears the failure counter after a successful login', async () => {
    const user = await createVerifiedUser(ctx)
    for (let i = 0; i < 3; i++) await api(ctx.app).post('/api/auth/login', { email: user.email, password: 'wrong-password-000' })
    expect((await api(ctx.app).post('/api/auth/login', { email: user.email, password: user.password })).status).toBe(200)
    for (let i = 0; i < 3; i++) {
      const res = await api(ctx.app).post('/api/auth/login', { email: user.email, password: 'wrong-password-000' })
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    }
  })

  it('rotates the session on login (no session fixation)', async () => {
    const user = await createVerifiedUser(ctx)
    const client = browser(ctx.app)
    const first = await client.post('/api/auth/login', { email: user.email, password: user.password })
    const second = await client.post('/api/auth/login', { email: user.email, password: user.password })
    expect(cookieOf(first)).not.toBe(cookieOf(second))
    expect(await Session.countDocuments()).toBe(1)
  })

  it('validates input before touching credentials', async () => {
    const res = await api(ctx.app).post('/api/auth/login', { email: '', password: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.fields).toMatchObject({ email: 'Enter your work email', password: 'Enter your password' })
  })
})
