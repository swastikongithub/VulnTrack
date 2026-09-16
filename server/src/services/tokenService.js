import { TOKEN_POLICY } from '../config/security.js'
import { AuthToken } from '../models/index.js'
import { generateToken, hashToken, looksLikeToken } from '../utils/crypto.js'
import { errors } from '../utils/errors.js'

/**
 * Issues a one-time token. Any earlier unused token of the same purpose for
 * this user is invalidated, so only the most recent email link works.
 */
export async function issueToken(userId, purpose, { session } = {}) {
  const now = Date.now()
  const { ttlMs } = TOKEN_POLICY[purpose]
  const token = generateToken()
  const expiresAt = new Date(now + ttlMs)

  await AuthToken.updateMany(
    { userId, purpose, consumedAt: null },
    { $set: { consumedAt: new Date(now) } },
    { session },
  )
  await AuthToken.create(
    [
      {
        tokenHash: hashToken(token),
        userId,
        purpose,
        expiresAt,
        purgeAt: new Date(expiresAt.getTime() + TOKEN_POLICY.retainAfterExpiryMs),
      },
    ],
    { session },
  )
  return { token, expiresAt }
}

/** Distinguishes expired links (helpful message) from unknown/used ones. */
async function classifyUnusable(tokenHash, purpose, session) {
  const existing = await AuthToken.findOne({ tokenHash, purpose }).session(session ?? null).lean()
  if (existing && !existing.consumedAt && existing.expiresAt.getTime() <= Date.now()) {
    return errors.tokenExpired()
  }
  return errors.tokenInvalid()
}

/** Returns the token record if usable, without consuming it. */
export async function inspectToken(token, purpose) {
  if (!looksLikeToken(token)) throw errors.tokenInvalid()
  const tokenHash = hashToken(token)
  const record = await AuthToken.findOne({
    tokenHash,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean()
  if (!record) throw await classifyUnusable(tokenHash, purpose)
  return record
}

/** Atomically marks a usable token consumed and returns it. A token can succeed exactly once. */
export async function consumeToken(token, purpose, { session } = {}) {
  if (!looksLikeToken(token)) throw errors.tokenInvalid()
  const tokenHash = hashToken(token)
  const now = new Date()
  const record = await AuthToken.findOneAndUpdate(
    { tokenHash, purpose, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } },
    { returnDocument: 'after', session },
  ).lean()
  if (!record) throw await classifyUnusable(tokenHash, purpose, session)
  return record
}

export async function invalidateTokens(userId, purpose, { session } = {}) {
  await AuthToken.updateMany({ userId, purpose, consumedAt: null }, { $set: { consumedAt: new Date() } }, { session })
}
