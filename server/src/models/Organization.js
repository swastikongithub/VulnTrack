import mongoose from 'mongoose'

/** The tenant boundary. Every future tenant-owned document references an organizationId. */
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 80, match: /^[a-z0-9-]+$/ },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /**
     * Bumped inside every transaction that changes roles or removes members. Not
     * security state: it makes concurrent roster transactions write the same
     * document, so MongoDB serializes them (one retries) and the "at least one
     * owner" check can't be defeated by two owners demoting each other at once.
     */
    rosterVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
)

organizationSchema.index({ slug: 1 }, { unique: true })

export const Organization = mongoose.models.Organization ?? mongoose.model('Organization', organizationSchema)
