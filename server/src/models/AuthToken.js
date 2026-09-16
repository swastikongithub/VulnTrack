import mongoose from 'mongoose'

export const TOKEN_PURPOSES = Object.freeze({
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
})

/**
 * One-time email tokens (verification, password reset). Only the SHA-256
 * digest is stored. A token is usable while consumedAt is null and
 * expiresAt is in the future; consuming is a single atomic update.
 */
const authTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: Object.values(TOKEN_PURPOSES), required: true },
    expiresAt: { type: Date, required: true },
    /** Set when used, or when superseded by a newer token of the same purpose. */
    consumedAt: { type: Date, default: null },
    /** Physical deletion time (TTL). Kept past expiry so old links report "expired". */
    purgeAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

authTokenSchema.index({ tokenHash: 1 }, { unique: true })
authTokenSchema.index({ userId: 1, purpose: 1, consumedAt: 1 })
authTokenSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })

export const AuthToken = mongoose.models.AuthToken ?? mongoose.model('AuthToken', authTokenSchema)
