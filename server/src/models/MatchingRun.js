import mongoose from 'mongoose'

/**
 * One matching run for one organization: the job log, the lock and the report.
 *
 *   running → succeeded | partial | failed
 *
 * Lock: a partial unique index allows at most one `running` run per
 * organization, so a repeated "Recalculate" can't run twice over the same
 * inventory. A run whose heartbeat has gone stale is failed by the next run
 * before it starts (services/matching/matchRunner.js).
 *
 * Mirrors the Phase 6 ingestion run log, but organization-scoped: matching
 * reads a tenant's inventory, so its runs belong to that tenant.
 */
const matchingRunSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    status: { type: String, enum: ['running', 'succeeded', 'partial', 'failed'], default: 'running' },
    /** api = a member with findings:create pressed Recalculate; cli = an operator. */
    trigger: { type: String, enum: ['api', 'cli', 'test'], default: 'api' },
    /** Who asked for it, when a person did. */
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, required: true },
    heartbeatAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    counts: {
      components: { type: Number, default: 0 },
      candidates: { type: Number, default: 0 },
      evaluated: { type: Number, default: 0 },
      affected: { type: Number, default: 0 },
      unknownVersion: { type: Number, default: 0 },
      undetermined: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      removed: { type: Number, default: 0 },
    },
    error: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
)

matchingRunSchema.index({ organizationId: 1 }, { unique: true, partialFilterExpression: { status: 'running' }, name: 'one_running_run_per_organization' })
matchingRunSchema.index({ organizationId: 1, startedAt: -1 })

export const MatchingRun = mongoose.models.MatchingRun ?? mongoose.model('MatchingRun', matchingRunSchema)
