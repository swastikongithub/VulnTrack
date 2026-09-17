import mongoose from 'mongoose'

/**
 * Audit trail for authentication, organization (RBAC) and inventory events.
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
    /** The member affected by an organization action (role change, removal). */
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    /** The invitation affected by an invitation action. */
    invitationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invitation', default: null },
    /** The organization-owned record an action affected (e.g. { type: 'asset', id }). Generic for later domains. */
    resourceType: { type: String, maxlength: 32, default: null },
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Small, fixed-shape details. Never free-form request data, tokens or emails. */
    metadata: {
      type: new mongoose.Schema(
        {
          role: { type: String, maxlength: 32 },
          previousRole: { type: String, maxlength: 32 },
          permission: { type: String, maxlength: 64 },
          fields: { type: [{ type: String, maxlength: 32 }], default: undefined },
          /** Before/after of enumerated fields only (criticality, status…) — never free text. */
          changes: {
            type: [
              new mongoose.Schema(
                {
                  field: { type: String, maxlength: 32 },
                  from: { type: String, maxlength: 64 },
                  to: { type: String, maxlength: 64 },
                },
                { _id: false },
              ),
            ],
            default: undefined,
          },
        },
        { _id: false },
      ),
      default: undefined,
    },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 256 },
    requestId: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)

auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ actorUserId: 1, createdAt: -1 })
auditLogSchema.index({ organizationId: 1, createdAt: -1 })
auditLogSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1, createdAt: -1 })

export const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditLogSchema)
