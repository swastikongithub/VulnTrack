import mongoose from 'mongoose'

/**
 * Fixed-window counters. Stored in MongoDB so limits hold across multiple API
 * instances; can move to Redis when Redis is introduced for background jobs.
 */
const rateLimitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, maxlength: 200 },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false },
)

rateLimitSchema.index({ key: 1 }, { unique: true })
rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 })

export const RateLimit = mongoose.models.RateLimit ?? mongoose.model('RateLimit', rateLimitSchema)
