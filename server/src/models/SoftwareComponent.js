import mongoose from 'mongoose'
import { SOFTWARE_ECOSYSTEMS, SOFTWARE_LIMITS, SOFTWARE_RELATIONSHIPS, SOFTWARE_SCOPES, SOFTWARE_SOURCES, values } from '../config/software.js'

const { ObjectId } = mongoose.Schema.Types

/**
 * A piece of software an asset runs: a registry package (npm, PyPI, Maven…)
 * or other software identified by vendor + product (nginx, PostgreSQL).
 * Master plan §27: Asset → Software → (later) Vulnerability matching → Finding.
 *
 * Its own collection rather than an array on the asset:
 *  - an asset can have hundreds of components, each edited on its own;
 *  - organization-wide questions ("which assets run lodash, in which
 *    versions?") need an index across assets;
 *  - findings will reference a component by `_id`.
 *
 * Tenant-owned like assets: every query filters `organizationId`, and every
 * index starts with it. `assetArchived` mirrors the parent asset's archive
 * flag (kept in step by the asset service) so live-inventory queries stay on
 * one collection.
 *
 * Identity fields are server-derived (utils/softwareIdentity.js) and never
 * accepted from clients.
 */
const softwareComponentSchema = new mongoose.Schema(
  {
    organizationId: { type: ObjectId, ref: 'Organization', required: true },
    assetId: { type: ObjectId, ref: 'Asset', required: true },
    assetArchived: { type: Boolean, default: false },

    ecosystem: { type: String, enum: values(SOFTWARE_ECOSYSTEMS), required: true },
    /** As entered (trimmed), for display. */
    name: { type: String, required: true, maxlength: SOFTWARE_LIMITS.nameMax },
    /** Other software only: the vendor/publisher, as entered. */
    vendor: { type: String, default: null, maxlength: SOFTWARE_LIMITS.vendorMax },
    /** `${ecosystem}:${normalized name}`: the package regardless of version. */
    componentKey: { type: String, required: true, maxlength: 340 },

    /** As entered; null when the version is unknown. */
    version: { type: String, default: null, maxlength: SOFTWARE_LIMITS.versionMax },
    /** Normalized for the ecosystem's version scheme; the value matching will compare. */
    versionNormalized: { type: String, default: null, maxlength: SOFTWARE_LIMITS.versionMax },
    /** Package URL, derived from ecosystem + name + version. */
    purl: { type: String, required: true, maxlength: 512 },

    relationship: { type: String, enum: values(SOFTWARE_RELATIONSHIPS), default: 'unknown' },
    scope: { type: String, enum: values(SOFTWARE_SCOPES), default: 'unknown' },

    /** Provenance. Server-controlled; `import` and `scanner` are reserved. */
    source: { type: String, enum: values(SOFTWARE_SOURCES), default: 'manual' },

    createdBy: { type: ObjectId, ref: 'User', required: true },
    updatedBy: { type: ObjectId, ref: 'User', required: true },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true, versionKey: false },
)

// One record per package version per asset (several versions of one package can coexist).
// Also serves an asset's own software list (its prefix).
softwareComponentSchema.index(
  { organizationId: 1, assetId: 1, componentKey: 1, versionNormalized: 1 },
  { unique: true, name: 'unique_component_version_per_asset' },
)
// Organization-wide inventory and "where is this package used" lookups (the future matching join).
softwareComponentSchema.index({ organizationId: 1, assetArchived: 1, componentKey: 1, versionNormalized: 1 })
softwareComponentSchema.index(
  { organizationId: 1, assetArchived: 1, name: 1 },
  { collation: { locale: 'en', strength: 2 }, name: 'inventory_by_name' },
)
softwareComponentSchema.index({ organizationId: 1, assetArchived: 1, ecosystem: 1 })
softwareComponentSchema.index({ organizationId: 1, assetArchived: 1, updatedAt: -1 })
softwareComponentSchema.index({ organizationId: 1, assetArchived: 1, createdAt: -1 })

export const SoftwareComponent = mongoose.models.SoftwareComponent ?? mongoose.model('SoftwareComponent', softwareComponentSchema)
