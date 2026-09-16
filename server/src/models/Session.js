import mongoose from 'mongoose'

/**
 * Server-side session. The browser holds only an opaque random id in an
 * httpOnly cookie; this collection stores its SHA-256 digest.
 */
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    activeOrganizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    persistent: { type: Boolean, default: false },
    /** Absolute expiry — never extended. TTL index removes the document afterwards. */
    expiresAt: { type: Date, required: true },
    /** Sliding inactivity expiry, extended on use (at most every few minutes). */
    idleExpiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 256 },
  },
  { timestamps: true },
)

sessionSchema.index({ tokenHash: 1 }, { unique: true })
sessionSchema.index({ userId: 1 })
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema)
