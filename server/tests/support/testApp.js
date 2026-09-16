import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, inject } from 'vitest'
import { createApp } from '../../src/app.js'
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js'
import { loadConfig } from '../../src/config/env.js'
import '../../src/models/index.js'
import { createEmailService } from '../../src/services/emailService.js'
import { createLogger } from '../../src/utils/logger.js'

export const ORIGIN = 'http://localhost:5173'
export const STRONG_PASSWORD = 'Lattice-Perimeter-42'

/**
 * Registers per-file lifecycle hooks and returns a live handle:
 *   ctx.app, ctx.mailer, ctx.config
 * The database is wiped before every test.
 */
export function useTestApp(overrides = {}) {
  const ctx = {}

  beforeAll(async () => {
    const uri = inject('mongoUri')
    const dbUri = uri.replace('/?', `/vt_test_${randomUUID().slice(0, 8)}?`)
    ctx.config = loadConfig({
      NODE_ENV: 'test',
      MONGODB_URI: dbUri,
      APP_ORIGIN: ORIGIN,
      AUTH_SECRET: 'test-only-secret-with-enough-length-0123456789',
      EMAIL_TRANSPORT: 'memory',
      LOG_LEVEL: 'silent',
      ...overrides,
    })
    ctx.logger = createLogger(ctx.config.log)
    ctx.mailer = createEmailService({ config: ctx.config, logger: ctx.logger })
    await connectDatabase(ctx.config.mongoUri)
    ctx.app = createApp({ config: ctx.config, logger: ctx.logger, mailer: ctx.mailer })
  })

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})))
    ctx.mailer.outbox.length = 0
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await disconnectDatabase()
  })

  return ctx
}

/** Supertest request with the browser Origin header (required by the CSRF guard). */
export function api(app) {
  const wrap = (agent) => ({
    get: (url) => agent.get(url),
    post: (url, body) => {
      const req = agent.post(url).set('Origin', ORIGIN)
      return body === undefined ? req : req.send(body)
    },
    agent,
  })
  return wrap(request(app))
}

/** Cookie-keeping client (like a browser). */
export function browser(app) {
  const agent = request.agent(app)
  return {
    get: (url) => agent.get(url),
    post: (url, body) => {
      const req = agent.post(url).set('Origin', ORIGIN)
      return body === undefined ? req : req.send(body)
    },
    agent,
  }
}

export function signupPayload(overrides = {}) {
  return {
    fullName: 'Ada Morgan',
    email: `ada.${randomUUID().slice(0, 6)}@acme.io`,
    workspace: 'Acme Security',
    password: STRONG_PASSWORD,
    confirmPassword: STRONG_PASSWORD,
    ...overrides,
  }
}

/** Extracts the one-time token from the most recent email matching `pathname`. */
export async function tokenFromEmail(mailer, pathname, to) {
  await mailer.idle()
  const message = [...mailer.outbox].reverse().find((m) => (!to || m.to.toLowerCase() === to.toLowerCase()) && m.text.includes(pathname))
  expect(message, `expected an email linking to ${pathname}`).toBeTruthy()
  const match = message.text.match(new RegExp(`${pathname}\\?token=([A-Za-z0-9_-]+)`))
  return match[1]
}

/** Signs up and verifies an account; returns its credentials. */
export async function createVerifiedUser(ctx, overrides = {}) {
  const payload = signupPayload(overrides)
  const res = await api(ctx.app).post('/api/auth/signup', payload)
  expect(res.status).toBe(202)
  const token = await tokenFromEmail(ctx.mailer, '/verify-email', payload.email)
  const verify = await api(ctx.app).post('/api/auth/email/verify', { token })
  expect(verify.status).toBe(200)
  return payload
}

/** Verified user + a signed-in cookie client. */
export async function signedInBrowser(ctx, overrides = {}) {
  const user = await createVerifiedUser(ctx, overrides)
  const client = browser(ctx.app)
  const res = await client.post('/api/auth/login', { email: user.email, password: user.password })
  expect(res.status).toBe(200)
  return { user, client, session: res.body }
}
