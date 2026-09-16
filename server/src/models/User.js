import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    /** Email as entered (trimmed), for display and outgoing mail. */
    email: { type: String, required: true, trim: true, maxlength: 254 },
    /** Lower-cased email; the identity used for lookups and uniqueness. */
    emailNormalized: { type: String, required: true, maxlength: 254 },
    /** Argon2id PHC string. Never selected unless explicitly requested. */
    passwordHash: { type: String, required: true, select: false },
    emailVerifiedAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true },
)

userSchema.index({ emailNormalized: 1 }, { unique: true })

userSchema.virtual('isEmailVerified').get(function isEmailVerified() {
  return this.emailVerifiedAt != null
})

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase()
}

export const User = mongoose.models.User ?? mongoose.model('User', userSchema)
