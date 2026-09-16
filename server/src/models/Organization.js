import mongoose from 'mongoose'

/** The tenant boundary. Every future tenant-owned document references an organizationId. */
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 80, match: /^[a-z0-9-]+$/ },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

organizationSchema.index({ slug: 1 }, { unique: true })

export const Organization = mongoose.models.Organization ?? mongoose.model('Organization', organizationSchema)
