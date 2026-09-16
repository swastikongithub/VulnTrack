import { RateLimit } from '../models/index.js'
import { errors } from '../utils/errors.js'

const DUPLICATE_KEY = 11000

function secondsUntil(date, now) {
  return Math.max(1, Math.ceil((date.getTime() - now) / 1000))
}

/**
 * Fixed-window counter in MongoDB. Each call increments the window for `key`
 * and reports whether the limit has been exceeded.
 */
export async function consume(key, { limit, windowMs }, attempt = 0) {
  const now = Date.now()
  try {
    let doc = await RateLimit.findOneAndUpdate(
      { key, resetAt: { $gt: new Date(now) } },
      { $inc: { count: 1 } },
      { returnDocument: 'after' },
    ).lean()

    if (!doc) {
      // No live window: start a new one (replaces an expired window not yet reaped by TTL).
      doc = await RateLimit.findOneAndUpdate(
        { key },
        { $set: { count: 1, resetAt: new Date(now + windowMs) } },
        { upsert: true, returnDocument: 'after' },
      ).lean()
    }

    return { allowed: doc.count <= limit, count: doc.count, retryAfter: secondsUntil(doc.resetAt, now) }
  } catch (error) {
    if (error?.code === DUPLICATE_KEY && attempt === 0) return consume(key, { limit, windowMs }, 1)
    throw error
  }
}

/** Reads a window without incrementing it. */
export async function peek(key, { limit }) {
  const now = Date.now()
  const doc = await RateLimit.findOne({ key, resetAt: { $gt: new Date(now) } }).lean()
  if (!doc) return { blocked: false, count: 0, retryAfter: 0 }
  return { blocked: doc.count >= limit, count: doc.count, retryAfter: secondsUntil(doc.resetAt, now) }
}

export async function reset(key) {
  await RateLimit.deleteOne({ key })
}

/** Consumes and throws RATE_LIMITED when over the limit. */
export async function enforce(key, rule, scope) {
  const result = await consume(key, rule)
  if (!result.allowed) throw errors.rateLimited(result.retryAfter, scope)
  return result
}
