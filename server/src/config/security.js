/**
 * Authentication security policy. Values that are product decisions (not
 * deployment settings) live here rather than in environment variables.
 */

export const PASSWORD_POLICY = Object.freeze({
  minLength: 12,
  maxLength: 128,
})

/** OWASP Password Storage Cheat Sheet — Argon2id minimum recommended parameters. */
export const ARGON2_OPTIONS = Object.freeze({
  algorithm: 2, // Argon2id
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
})

export const TOKEN_POLICY = Object.freeze({
  email_verification: { ttlMs: 24 * 60 * 60 * 1000 },
  password_reset: { ttlMs: 30 * 60 * 1000 },
  /** Consumed/expired token records are kept briefly so an old link reports "expired" rather than "invalid". */
  retainAfterExpiryMs: 7 * 24 * 60 * 60 * 1000,
})

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/**
 * Fixed-window limits. `account` keys are HMAC fingerprints of the normalized
 * email, so they behave identically for existing and non-existing accounts.
 */
export const RATE_LIMITS = Object.freeze({
  loginIp: { limit: 30, windowMs: 15 * MINUTE },
  loginAccountFailures: { limit: 5, windowMs: 15 * MINUTE },
  signupIp: { limit: 10, windowMs: HOUR },
  passwordResetRequestIp: { limit: 20, windowMs: HOUR },
  passwordResetRequestAccount: { limit: 3, windowMs: HOUR },
  verificationResendIp: { limit: 20, windowMs: HOUR },
  verificationResendAccountInterval: { limit: 1, windowMs: MINUTE },
  verificationResendAccountHourly: { limit: 5, windowMs: HOUR },
  tokenIp: { limit: 30, windowMs: 15 * MINUTE },
})

export const REQUEST_BODY_LIMIT = '10kb'
