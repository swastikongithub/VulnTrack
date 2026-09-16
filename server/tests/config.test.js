import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/env.js'

const base = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/vulntrack',
  APP_ORIGIN: 'http://localhost:5173',
  AUTH_SECRET: 'x'.repeat(48),
}

const production = {
  ...base,
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://app.vulntrack.example',
  AUTH_SECRET: 'Q7v2mLr9TzK4pWn8XbC1yHd6FsJ3gUa5eRo0iVt2',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.provider.example',
}

describe('environment configuration', () => {
  it('fails fast on missing or weak required settings', () => {
    expect(() => loadConfig({})).toThrow(/MONGODB_URI|APP_ORIGIN|AUTH_SECRET/)
    expect(() => loadConfig({ ...base, AUTH_SECRET: 'too-short' })).toThrow(/AUTH_SECRET/)
  })

  it('uses a __Host- prefixed Secure cookie in production', () => {
    const config = loadConfig(production)
    expect(config.cookie).toEqual({ secure: true, sameSite: 'lax', name: '__Host-vt_session' })
    expect(config.allowedOrigins).toEqual(['https://app.vulntrack.example'])
  })

  it('refuses unsafe production settings', () => {
    expect(() => loadConfig({ ...production, EMAIL_TRANSPORT: 'log' })).toThrow(/EMAIL_TRANSPORT/)
    expect(() => loadConfig({ ...production, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/)
    expect(() => loadConfig({ ...production, APP_ORIGIN: 'http://app.vulntrack.example' })).toThrow(/https/)
    expect(() => loadConfig({ ...production, AUTH_SECRET: 'change-me-change-me-change-me-change-me' })).toThrow(/placeholder/)
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST/)
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: 'memory' })).toThrow(/tests only/)
  })

  it('development defaults keep cookies usable over http localhost', () => {
    const config = loadConfig(base)
    expect(config.cookie.secure).toBe(false)
    expect(config.cookie.name).toBe('vt_session')
    expect(config.session.ttlMs).toBe(12 * 60 * 60 * 1000)
  })
})
