/**
 * Collects the request facts services need (client ip, user agent, request id,
 * presented session cookie) into `req.ctx`, so services never touch `req`.
 */
export function requestContext(config) {
  return (req, _res, next) => {
    req.ctx = {
      ip: req.ip,
      userAgent: String(req.get('user-agent') ?? '').slice(0, 256),
      requestId: String(req.id ?? ''),
      presentedSessionToken: req.cookies?.[config.cookie.name] ?? null,
    }
    next()
  }
}

/** Authentication responses must never be cached by browsers or intermediaries. */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store')
  next()
}
