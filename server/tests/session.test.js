import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { AuditLog, Session } from '../src/models/index.js'
import { api, ORIGIN, signedInBrowser, useTestApp } from './support/testApp.js'

const ctx = useTestApp()

describe('GET /api/auth/session', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await api(ctx.app).get('/api/auth/session')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('returns the current user, organization and role for a valid session (persists across requests)', async () => {
    const { user, client } = await signedInBrowser(ctx)
    for (let i = 0; i < 2; i++) {
      const res = await client.get('/api/auth/session')
      expect(res.status).toBe(200)
      expect(res.body.user.email).toBe(user.email)
      expect(res.body.organization.name).toBe('Acme Security')
      expect(res.body.membership.role).toBe('owner')
    }
  })

  it('rejects and clears a forged session cookie', async () => {
    const res = await request(ctx.app).get('/api/auth/session').set('Cookie', `vt_session=${'A'.repeat(43)}`)
    expect(res.status).toBe(401)
    expect(res.headers['set-cookie']?.[0]).toMatch(/vt_session=;/)
  })

  it('rejects sessions past their absolute or idle expiry', async () => {
    const { client } = await signedInBrowser(ctx)
    await Session.updateMany({}, { $set: { idleExpiresAt: new Date(Date.now() - 1000) } })
    expect((await client.get('/api/auth/session')).status).toBe(401)
    expect(await Session.countDocuments()).toBe(0)

    const second = await signedInBrowser(ctx)
    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await second.client.get('/api/auth/session')).status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('destroys the server-side session and clears the cookie', async () => {
    const { client } = await signedInBrowser(ctx)
    expect(await Session.countDocuments()).toBe(1)

    const res = await client.post('/api/auth/logout')
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/vt_session=;/)
    expect(await Session.countDocuments()).toBe(0)
    expect((await client.get('/api/auth/session')).status).toBe(401)
    expect(await AuditLog.countDocuments({ action: 'auth.logout' })).toBe(1)
  })

  it('only ends the session it was called with (other devices stay signed in)', async () => {
    const { user, client: laptop } = await signedInBrowser(ctx)
    const phone = await signedInBrowser(ctx, {}).then(() => null) // unrelated user
    expect(phone).toBeNull()

    const { browser } = await import('./support/testApp.js')
    const tablet = browser(ctx.app)
    expect((await tablet.post('/api/auth/login', { email: user.email, password: user.password })).status).toBe(200)

    await laptop.post('/api/auth/logout')
    expect((await laptop.get('/api/auth/session')).status).toBe(401)
    expect((await tablet.get('/api/auth/session')).status).toBe(200)
  })

  it('is idempotent without a session', async () => {
    expect((await api(ctx.app).post('/api/auth/logout')).status).toBe(200)
  })
})

describe('CSRF and request hardening', () => {
  it('rejects state-changing requests without an allowed Origin', async () => {
    const { client } = await signedInBrowser(ctx)

    const missing = await client.agent.post('/api/auth/logout')
    expect(missing.status).toBe(403)
    expect(missing.body.error.code).toBe('CSRF_REJECTED')

    const foreign = await client.agent.post('/api/auth/logout').set('Origin', 'https://evil.example')
    expect(foreign.status).toBe(403)
    expect(await Session.countDocuments()).toBe(1)

    const referer = await client.agent.post('/api/auth/logout').set('Referer', `${ORIGIN}/session`)
    expect(referer.status).toBe(200)
  })

  it('requires JSON bodies and rejects oversized or malformed payloads', async () => {
    const form = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .type('form')
      .send('email=a@b.co&password=x')
    expect(form.status).toBe(415)

    const malformed = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"email":')
    expect(malformed.status).toBe(400)
    expect(malformed.body.error.code).toBe('VALIDATION_FAILED')

    const huge = await api(ctx.app).post('/api/auth/login', { email: 'a@b.co', password: 'x'.repeat(20_000) })
    expect(huge.status).toBe(413)
  })

  it('does not leak internals in error responses and sets security headers', async () => {
    const res = await api(ctx.app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Not found.', requestId: expect.any(String) })
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('does not grant CORS credentials to foreign origins', async () => {
    const res = await request(ctx.app).get('/api/auth/session').set('Origin', 'https://evil.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    const ok = await request(ctx.app).get('/api/auth/session').set('Origin', ORIGIN)
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect(ok.headers['access-control-allow-credentials']).toBe('true')
  })
})
