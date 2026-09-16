import { Session, User } from '../models/index.js'
import { generateToken, hashToken, looksLikeToken } from '../utils/crypto.js'

/**
 * Server-side sessions referenced by an opaque cookie. See
 * docs/authentication/session-strategy.md for the rationale.
 */
export function createSessionService({ config }) {
  const policy = config.session

  async function createSession({ userId, persistent, activeOrganizationId, ctx }) {
    const now = Date.now()
    const token = generateToken()
    const expiresAt = new Date(now + (persistent ? policy.rememberMs : policy.ttlMs))
    const idleExpiresAt = new Date(Math.min(now + (persistent ? policy.rememberIdleMs : policy.idleMs), expiresAt.getTime()))

    const session = await Session.create({
      tokenHash: hashToken(token),
      userId,
      activeOrganizationId,
      persistent: Boolean(persistent),
      expiresAt,
      idleExpiresAt,
      lastSeenAt: new Date(now),
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    })
    return { token, session }
  }

  /**
   * Resolves a presented cookie value to a live session + active user.
   * Returns null for anything unusable; expired sessions are deleted eagerly.
   */
  async function resolveSession(token) {
    if (!looksLikeToken(token)) return null
    const session = await Session.findOne({ tokenHash: hashToken(token) })
    if (!session) return null

    const now = Date.now()
    if (session.expiresAt.getTime() <= now || session.idleExpiresAt.getTime() <= now) {
      await Session.deleteOne({ _id: session._id })
      return null
    }

    const user = await User.findById(session.userId)
    // Sessions created before a password change are dead even if revocation raced.
    const passwordChangedAfter = user?.passwordChangedAt && user.passwordChangedAt > session.createdAt
    if (!user || user.status !== 'active' || !user.emailVerifiedAt || passwordChangedAfter) {
      await Session.deleteOne({ _id: session._id })
      return null
    }

    // Sliding inactivity window, written at most every few minutes.
    if (now - session.lastSeenAt.getTime() >= policy.touchIntervalMs) {
      const idle = session.persistent ? policy.rememberIdleMs : policy.idleMs
      session.lastSeenAt = new Date(now)
      session.idleExpiresAt = new Date(Math.min(now + idle, session.expiresAt.getTime()))
      await Session.updateOne(
        { _id: session._id },
        { $set: { lastSeenAt: session.lastSeenAt, idleExpiresAt: session.idleExpiresAt } },
      )
    }

    return { session, user }
  }

  async function revokeSession(token) {
    if (!looksLikeToken(token)) return
    await Session.deleteOne({ tokenHash: hashToken(token) })
  }

  async function revokeAllSessions(userId, { session } = {}) {
    const result = await Session.deleteMany({ userId }, { session })
    return result.deletedCount
  }

  function cookieOptions(session) {
    return {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      path: '/',
      // Persistent sessions survive a browser restart; others end with the browser session.
      ...(session.persistent ? { expires: session.expiresAt } : {}),
    }
  }

  function clearCookieOptions() {
    return { httpOnly: true, secure: config.cookie.secure, sameSite: config.cookie.sameSite, path: '/' }
  }

  return { createSession, resolveSession, revokeSession, revokeAllSessions, cookieOptions, clearCookieOptions }
}
