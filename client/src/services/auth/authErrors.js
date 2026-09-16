/**
 * Auth error contract shared by the real API client and the design-preview mock.
 * Codes match the API's `error.code` values (server/src/utils/errors.js).
 */

export class AuthError extends Error {
  constructor(code, message, meta = {}) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    /** { status, fields, retryAfter, scope: 'account' | 'client', requestId } */
    this.meta = meta
  }
}

export const AUTH_ERROR = {
  VALIDATION: 'VALIDATION_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  NETWORK: 'NETWORK',
  SERVER: 'SERVER',
}

function formatWait(seconds) {
  if (!seconds) return 'shortly'
  if (seconds < 90) return 'in about a minute'
  return `in about ${Math.ceil(seconds / 60)} minutes`
}

const RATE_LIMIT_COPY = {
  login: {
    title: 'Too many sign-in attempts',
    account: 'For your security, sign-in is temporarily paused for this account.',
  },
  signup: { title: 'Too many sign-up attempts' },
  recovery: { title: 'Too many reset requests' },
  verification: { title: 'Too many verification emails requested' },
}

/**
 * Copy for non-field errors, by screen context. Never discloses whether an
 * account exists.
 * @param {AuthError} error
 * @param {'login'|'signup'|'recovery'|'verification'|'session'} [context]
 */
export function describeAuthError(error, context = 'login') {
  if (error && !(error instanceof AuthError) && import.meta.env.DEV) {
    // A programming error, not an API outcome — make it visible during development.
    console.error('[auth] unexpected client error', error)
  }
  switch (error?.code) {
    case AUTH_ERROR.INVALID_CREDENTIALS:
      return { title: 'Email or password is incorrect', body: 'Check your details and try again.' }
    case AUTH_ERROR.RATE_LIMITED: {
      const copy = RATE_LIMIT_COPY[context] ?? RATE_LIMIT_COPY.login
      const body =
        error.meta?.scope === 'account' && copy.account
          ? copy.account
          : error.meta?.scope === 'client'
            ? `Too many requests from this network. Try again ${formatWait(error.meta?.retryAfter)}.`
            : `For your security, please wait and try again ${formatWait(error.meta?.retryAfter)}.`
      return { title: copy.title, body }
    }
    case AUTH_ERROR.EMAIL_NOT_VERIFIED:
      return { title: 'Verify your email to continue', body: 'Open the verification link we sent you, or request a new one.' }
    case AUTH_ERROR.NETWORK:
      return { title: "Can't reach VulnTrack", body: 'Check your connection and try again.' }
    case AUTH_ERROR.VALIDATION:
      return { title: 'Some details need attention', body: 'Review the highlighted fields and try again.' }
    default:
      return { title: 'Something went wrong on our side', body: 'Nothing was changed. Please try again in a moment.' }
  }
}
