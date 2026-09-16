import { AUTH_ERROR, AuthError } from './authErrors'

/**
 * DESIGN-PREVIEW MOCK of the auth service (development only, VITE_AUTH_MODE=mock).
 * Same signatures, payload shapes and error codes as apiAuthService.js, with
 * deterministic scenarios (mockScenarios.js) so every UI state can be shown
 * without a backend. Never used in production builds. Nothing here is secure.
 */

const DEMO_PASSWORD_REJECT = 'incorrect-password'
let mockSession = null

const wait = (min = 900, max = 1500) =>
  new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)))

const localPart = (email) => email.trim().toLowerCase().split('@')[0]

function failForScenario(email) {
  const who = localPart(email)
  if (who === 'offline') throw new AuthError(AUTH_ERROR.NETWORK, 'Network unavailable')
  if (who === 'error') throw new AuthError(AUTH_ERROR.SERVER, 'Unexpected server error')
}

export async function login({ email, password, remember }) {
  await wait()
  failForScenario(email)
  const who = localPart(email)
  if (who === 'locked') throw new AuthError(AUTH_ERROR.RATE_LIMITED, 'Too many attempts', { retryAfter: 30, scope: 'account' })
  if (who === 'unverified') throw new AuthError(AUTH_ERROR.EMAIL_NOT_VERIFIED, 'Email not verified')
  if (password === DEMO_PASSWORD_REJECT) {
    throw new AuthError(AUTH_ERROR.INVALID_CREDENTIALS, 'Invalid credentials')
  }
  mockSession = {
    user: { id: 'mock-user', fullName: 'Preview User', email: email.trim().toLowerCase(), emailVerified: true },
    organization: { id: 'mock-org', name: 'Preview Workspace', slug: 'preview-workspace' },
    membership: { role: 'owner', roleLabel: 'Owner' },
    memberships: [],
    session: { persistent: Boolean(remember), expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString() },
  }
  return mockSession
}

export async function getSession() {
  return mockSession
}

export async function signup({ fullName, email, workspace }) {
  await wait(1100, 1700)
  failForScenario(email)
  // Always respond identically for existing / new emails (no account enumeration).
  return { email: email.trim().toLowerCase(), fullName: fullName.trim(), workspace: workspace.trim() }
}

export async function requestPasswordReset({ email }) {
  await wait()
  failForScenario(email)
  // Same response whether or not the account exists.
  return { ok: true }
}

/** Checks a reset link before showing the new-password form. */
export async function checkResetToken({ token }) {
  await wait(600, 900)
  if (!token || token === 'invalid') throw new AuthError(AUTH_ERROR.TOKEN_INVALID, 'Invalid reset link')
  if (token === 'expired') throw new AuthError(AUTH_ERROR.TOKEN_EXPIRED, 'Reset link expired')
  return { ok: true }
}

export async function resetPassword({ token }) {
  await wait()
  if (!token || token === 'invalid') throw new AuthError(AUTH_ERROR.TOKEN_INVALID, 'Invalid reset link')
  if (token === 'expired') throw new AuthError(AUTH_ERROR.TOKEN_EXPIRED, 'Reset link expired')
  if (token === 'error') throw new AuthError(AUTH_ERROR.SERVER, 'Unexpected server error')
  return { ok: true, sessionsRevoked: true }
}

export async function verifyEmail({ token }) {
  await wait(1400, 2000)
  if (token === 'expired') throw new AuthError(AUTH_ERROR.TOKEN_EXPIRED, 'Verification link expired')
  if (token === 'invalid') throw new AuthError(AUTH_ERROR.TOKEN_INVALID, 'Invalid verification link')
  if (token === 'error') throw new AuthError(AUTH_ERROR.SERVER, 'Unexpected server error')
  return { ok: true }
}

export async function resendVerification({ email }) {
  await wait(700, 1100)
  if (email) failForScenario(email)
  return { ok: true, cooldown: 60 }
}

export async function logout() {
  await wait(300, 500)
  mockSession = null
  return { ok: true }
}
