import { apiRequest } from '../api/httpClient'

/**
 * Real authentication service backed by the VulnTrack API.
 * Endpoint contracts: docs/authentication/api.md
 */

/**
 * Auth actions resolve at least this long after they start. Local API calls
 * can finish in tens of milliseconds, which would flash the loading state and
 * cut the artwork's loading choreography short.
 */
const MIN_ACTION_MS = 700

async function paced(promise, minimumMs = MIN_ACTION_MS) {
  const started = performance.now()
  const settle = async () => {
    const remaining = minimumMs - (performance.now() - started)
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
  }
  try {
    const result = await promise
    await settle()
    return result
  } catch (error) {
    await settle()
    throw error
  }
}

const post = (path, body) => apiRequest(path, { method: 'POST', body })

/**
 * @returns {Promise<{ user, organization, membership, memberships, session }>}
 */
export function login({ email, password, remember }) {
  return paced(post('/auth/login', { email, password, remember: Boolean(remember) }))
}

export function signup({ fullName, email, password, confirmPassword, workspace }) {
  return paced(post('/auth/signup', { fullName, email, password, confirmPassword, workspace }), 900)
}

export function logout() {
  return paced(post('/auth/logout', {}), 400)
}

/** Current session, or null when signed out. */
export async function getSession() {
  try {
    return await apiRequest('/auth/session')
  } catch (error) {
    if (error.meta?.status === 401) return null
    throw error
  }
}

export function requestPasswordReset({ email }) {
  return paced(post('/auth/password/forgot', { email }))
}

export function checkResetToken({ token }) {
  return paced(post('/auth/password/reset/validate', { token: token ?? '' }), 600)
}

export function resetPassword({ token, password }) {
  return paced(post('/auth/password/reset', { token: token ?? '', password }))
}

export function verifyEmail({ token }) {
  return paced(post('/auth/email/verify', { token: token ?? '' }), 1100)
}

export function resendVerification({ email }) {
  return paced(post('/auth/email/resend', { email }))
}
