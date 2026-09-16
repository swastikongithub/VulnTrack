import { errors } from '../utils/errors.js'

/**
 * Resolves the session cookie into `req.auth = { session, user }` (or null).
 * Invalid or expired cookies are cleared from the browser.
 */
export function loadSession({ config, sessions }) {
  return async (req, res, next) => {
    req.auth = null
    const token = req.ctx.presentedSessionToken
    if (!token) return next()

    const resolved = await sessions.resolveSession(token)
    if (resolved) {
      req.auth = resolved
    } else {
      res.clearCookie(config.cookie.name, sessions.clearCookieOptions())
    }
    next()
  }
}

export function requireAuth(req, _res, next) {
  if (!req.auth) return next(errors.unauthenticated())
  next()
}
