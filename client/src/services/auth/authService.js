/**
 * Auth service — MOCK IMPLEMENTATION for the auth UI/UX phase.
 *
 * The function signatures and error codes are the contract the UI depends
 * on. When the real backend lands, replace the bodies with API calls and keep
 * the shapes. Nothing here is secure; no credentials leave the browser.
 *
 * Deterministic preview scenarios (see mockScenarios.js) let every UI state
 * be exercised without a server.
 */

export class AuthError extends Error {
  constructor(code, message, meta = {}) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.meta = meta
  }
}

export const AUTH_ERROR = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  RATE_LIMITED: 'RATE_LIMITED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  NETWORK: 'NETWORK',
  SERVER: 'SERVER',
}

const DEMO_PASSWORD_REJECT = 'incorrect-password'

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
  if (who === 'locked') throw new AuthError(AUTH_ERROR.RATE_LIMITED, 'Too many attempts', { retryAfter: 30 })
  if (who === 'unverified') throw new AuthError(AUTH_ERROR.EMAIL_NOT_VERIFIED, 'Email not verified')
  if (password === DEMO_PASSWORD_REJECT) {
    throw new AuthError(AUTH_ERROR.INVALID_CREDENTIALS, 'Invalid credentials')
  }
  return {
    user: { email: email.trim().toLowerCase(), name: null },
    workspace: { name: null, role: 'Owner' },
    persistent: Boolean(remember),
  }
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
  return { ok: true }
}

/** Copy used for non-field errors. Never discloses whether an account exists. */
export function describeAuthError(error) {
  switch (error?.code) {
    case AUTH_ERROR.INVALID_CREDENTIALS:
      return { title: 'Email or password is incorrect', body: 'Check your details and try again.' }
    case AUTH_ERROR.RATE_LIMITED:
      return {
        title: 'Too many sign-in attempts',
        body: 'For your security, sign-in is temporarily paused for this account.',
      }
    case AUTH_ERROR.EMAIL_NOT_VERIFIED:
      return { title: 'Verify your email to continue', body: 'Open the verification link we sent you, or request a new one.' }
    case AUTH_ERROR.NETWORK:
      return { title: "Can't reach VulnTrack", body: 'Check your connection and try again.' }
    default:
      return { title: 'Something went wrong on our side', body: 'Nothing was changed. Please try again in a moment.' }
  }
}
