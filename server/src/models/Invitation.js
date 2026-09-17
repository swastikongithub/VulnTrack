import mongoose from 'mongoose'
import { ROLE_VALUES } from '../config/roles.js'

export const INVITATION_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
})

/**
 * An invitation for an email address to join an organization with a role.
 *
 * - Only the SHA-256 digest of the invitation token is stored.
 * - The role is fixed when the invitation is created by someone allowed to
 *   grant it; acceptance never reads a role from the request.
 * - At most one *pending* invitation per (organization, email) — a partial
 *   unique index makes this hold under concurrency.
 * - A pending invitation past `expiresAt` is unusable; it is reported as
 *   expired and flipped to `expired` when a new invitation replaces it.
 */
const invitationSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    /** As entered (trimmed), for display and outgoing mail. */
    email: { type: String, required: true, trim: true, maxlength: 254 },
    emailNormalized: { type: String, required: true, maxlength: 254 },
    role: { type: String, enum: ROLE_VALUES, required: true },
    tokenHash: { type: String, required: true },
    status: { type: String, enum: Object.values(INVITATION_STATUS), default: INVITATION_STATUS.PENDING },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, default: 1 },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    /** null when revoked by the system (e.g. the inviter lost the authority to grant the role). */
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    /** Physical deletion time (TTL). History is kept a while past expiry; the audit log keeps the rest. */
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
)

invitationSchema.index({ tokenHash: 1 }, { unique: true })
invitationSchema.index(
  { organizationId: 1, emailNormalized: 1 },
  { unique: true, partialFilterExpression: { status: INVITATION_STATUS.PENDING }, name: 'one_pending_invitation_per_email' },
)
invitationSchema.index({ organizationId: 1, status: 1, createdAt: -1 })
invitationSchema.index({ invitedBy: 1, status: 1 })
invitationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })

export const Invitation = mongoose.models.Invitation ?? mongoose.model('Invitation', invitationSchema)
