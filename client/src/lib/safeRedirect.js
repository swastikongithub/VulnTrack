/**
 * Post-sign-in destinations accepted from a `next` query parameter. An
 * allowlist of in-app paths (never absolute or protocol-relative URLs), so the
 * parameter can't be used as an open redirect.
 */
const ALLOWED = [/^\/invite\?token=[A-Za-z0-9_-]{1,512}$/, /^\/organization(\/(members|settings|assets(\/new|\/[a-f0-9]{24}(\/edit)?)?))?$/]

export function safeNextPath(value) {
  if (typeof value !== 'string') return null
  return ALLOWED.some((pattern) => pattern.test(value)) ? value : null
}
