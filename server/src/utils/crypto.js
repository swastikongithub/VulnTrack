import { createHash, createHmac, randomBytes } from 'node:crypto'

/** 256-bit random token, URL-safe. Used for session ids and one-time email tokens. */
export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Tokens are stored only as SHA-256 digests. They carry 256 bits of entropy,
 * so an unsalted fast hash is appropriate (no dictionary to attack) and allows
 * direct indexed lookup. A database leak does not expose usable tokens.
 */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Keyed fingerprint for low-entropy identifiers (emails) used in rate-limit keys and audit logs. */
export function fingerprint(secret, value) {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex').slice(0, 32)
}

/** Shape check before hashing/looking up a presented token. */
export function looksLikeToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value)
}
