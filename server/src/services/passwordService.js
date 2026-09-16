import { hash, verify } from '@node-rs/argon2'
import { ARGON2_OPTIONS, PASSWORD_POLICY } from '../config/security.js'

let dummyHashPromise

/** Argon2id hash with OWASP-recommended parameters (salt is generated per hash). */
export function hashPassword(password) {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(passwordHash, password) {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

/**
 * Runs a full Argon2 verification against a throwaway hash so that requests
 * for unknown accounts take about as long as requests for real ones.
 */
export async function verifyAgainstDummy(password) {
  dummyHashPromise ??= hash('vulntrack-timing-equalizer', ARGON2_OPTIONS)
  await verifyPassword(await dummyHashPromise, password)
  return false
}

/**
 * Password policy (NIST SP 800-63B): length-based, no composition rules,
 * reject passwords containing the user's own identifiers. Mirrors the web
 * client's validators so both layers give the same message.
 */
export function passwordPolicyError(password, { email = '', fullName = '' } = {}) {
  if (typeof password !== 'string' || password.length === 0) return 'Create a password'
  if (password.length < PASSWORD_POLICY.minLength) return `Use at least ${PASSWORD_POLICY.minLength} characters`
  if (password.length > PASSWORD_POLICY.maxLength) return `Use ${PASSWORD_POLICY.maxLength} characters or fewer`

  const lower = password.toLowerCase()
  const emailLocal = String(email).split('@')[0]?.toLowerCase() ?? ''
  const nameParts = String(fullName)
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length >= 4)
  if ((emailLocal.length >= 4 && lower.includes(emailLocal)) || nameParts.some((part) => lower.includes(part))) {
    return "Don't include your name or email"
  }
  return undefined
}
