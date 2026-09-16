import mongoose from 'mongoose'
import { ROLE_VALUES } from '../config/roles.js'

/**
 * Links a user to an organization with exactly one role. Authorization for any
 * organization-scoped resource starts by resolving this document for
 * (organizationId, userId) — never by trusting an id supplied by the client.
 */
const membershipSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROLE_VALUES, required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true },
)

membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true })
membershipSchema.index({ userId: 1, createdAt: 1 })

export const Membership = mongoose.models.Membership ?? mongoose.model('Membership', membershipSchema)
