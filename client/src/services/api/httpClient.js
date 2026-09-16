import { AUTH_ERROR, AuthError } from '../auth/authErrors'

/**
 * Minimal JSON client for the VulnTrack API.
 *
 * - Same-site by default: in development Vite proxies `/api` to the API server,
 *   so the session cookie is first-party. Set VITE_API_BASE_URL for deployments
 *   where the API lives on another host of the same site.
 * - `credentials: 'include'` sends the httpOnly session cookie; the client
 *   never reads or stores session tokens itself.
 * - Every failure is normalized into an AuthError the UI already understands.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
const DEFAULT_TIMEOUT_MS = 15_000

export async function apiRequest(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    // Offline, DNS failure, CORS rejection or timeout.
    throw new AuthError(AUTH_ERROR.NETWORK, 'Network unavailable')
  } finally {
    clearTimeout(timer)
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  let data = null
  if (isJson) {
    try {
      data = await response.json()
    } catch {
      data = null
    }
  }

  if (response.ok) return data

  const error = data?.error
  if (error?.code) {
    throw new AuthError(error.code, error.message, {
      status: response.status,
      fields: error.fields,
      retryAfter: error.retryAfter,
      scope: error.scope,
      requestId: error.requestId,
    })
  }

  // A non-JSON 5xx comes from a proxy/gateway in front of an unreachable API.
  if (response.status >= 500) throw new AuthError(AUTH_ERROR.NETWORK, `Upstream unavailable (${response.status})`)
  throw new AuthError(AUTH_ERROR.SERVER, `Unexpected response (${response.status})`, { status: response.status })
}
