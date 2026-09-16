import { AppError, ERROR_CODES, errors } from '../utils/errors.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defense for cookie-authenticated requests (OWASP "verify origin with
 * standard headers"). Every state-changing request must carry an Origin (or,
 * failing that, Referer) that exactly matches an allowed web origin.
 *
 * This layers on top of SameSite=Lax cookies and the JSON-only body rule below
 * (a cross-site HTML form cannot send application/json without a CORS preflight).
 */
export function originGuard(config) {
  const allowed = new Set(config.allowedOrigins)

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next()

    let origin = req.get('origin')
    if (!origin) {
      const referer = req.get('referer')
      if (referer) {
        try {
          origin = new URL(referer).origin
        } catch {
          origin = null
        }
      }
    }
    if (!origin || !allowed.has(origin)) return next(errors.csrf())
    next()
  }
}

/** State-changing requests with a body must be JSON. */
export function requireJsonBody(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next()
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') != null
  if (hasBody && !req.is('application/json')) {
    return next(new AppError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 'Requests must be sent as JSON.'))
  }
  next()
}
