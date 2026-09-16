import mongoose from 'mongoose'

/**
 * Audit foundation — currently records authentication events only.
 * Append-only from the application's perspective: there is no update or
 * delete code path. Raw emails of unknown subjects are never stored; a keyed
 * fingerprint allows correlating repeated attempts.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, maxlength: 64 },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    subjectFingerprint: { type: String, maxlength: 64, default: null },
    reason: { type: String, maxlength: 64, default: null },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 256 },
    requestId: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)

auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ actorUserId: 1, createdAt: -1 })
auditLogSchema.index({ organizationId: 1, createdAt: -1 })

export const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditLogSchema)
