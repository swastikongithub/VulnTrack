import mongoose from 'mongoose'
import {
  ASSET_CRITICALITIES,
  ASSET_DISCOVERY_SOURCES,
  ASSET_ENVIRONMENTS,
  ASSET_EXPOSURES,
  ASSET_IDENTIFIER_KINDS,
  ASSET_LIMITS,
  ASSET_STATUSES,
  ASSET_TYPES,
  values,
} from '../config/assets.js'

const { ObjectId } = mongoose.Schema.Types

/**
 * Something the organization needs to protect (master plan §5.1, §26).
 *
 * Tenant-owned: every document carries `organizationId`, every query filters
 * by it, and every index starts with it.
 *
 * Future phases attach to assets by `_id` (software inventory, findings,
 * remediation) and recognise them by `identifiers` (scanners, imports), so
 * identifiers are typed, normalized and unique per organization among
 * non-archived assets.
 */
const identifierSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: values(ASSET_IDENTIFIER_KINDS), required: true },
    /** As entered (trimmed). */
    value: { type: String, required: true, maxlength: ASSET_LIMITS.identifierValueMax },
    /** Comparison form (see utils/assetIdentifiers.js). */
    normalized: { type: String, required: true, maxlength: ASSET_LIMITS.identifierValueMax },
  },
  { _id: false },
)

const assetSchema = new mongoose.Schema(
  {
    organizationId: { type: ObjectId, ref: 'Organization', required: true },

    name: { type: String, required: true, trim: true, maxlength: ASSET_LIMITS.nameMax },
    description: { type: String, default: '', maxlength: ASSET_LIMITS.descriptionMax },
    type: { type: String, enum: values(ASSET_TYPES), required: true },
    environment: { type: String, enum: values(ASSET_ENVIRONMENTS), required: true },
    criticality: { type: String, enum: values(ASSET_CRITICALITIES), required: true },
    /** Derived from `criticality` on save; lets the database sort by severity order. */
    criticalityRank: { type: Number, required: true, min: 1, max: 4 },
    exposure: { type: String, enum: values(ASSET_EXPOSURES), default: 'unknown' },
    status: { type: String, enum: values(ASSET_STATUSES), default: 'active' },

    identifiers: { type: [identifierSchema], default: [] },
    /** `${kind}:${normalized}` for each identifier — the uniqueness / lookup key. */
    identifierKeys: { type: [String], default: [] },
    tags: { type: [{ type: String, maxlength: ASSET_LIMITS.tagMax }], default: [] },
    /** Free-text technology labels ("Node.js"). Versioned software inventory is a later phase. */
    technologies: { type: [{ type: String, maxlength: ASSET_LIMITS.technologyMax }], default: [] },

    owner: {
      team: { type: String, default: '', maxlength: ASSET_LIMITS.teamMax },
      /** Must be an active member when set; resolved (not trusted) on every read. */
      contactUserId: { type: ObjectId, ref: 'User', default: null },
    },

    /** Provenance. Server-controlled; reserved fields for import/scanner phases. */
    discovery: {
      source: { type: String, enum: values(ASSET_DISCOVERY_SOURCES), default: 'manual' },
      /** ID in the external system that reported the asset (scanner / integration). */
      externalId: { type: String, default: null, maxlength: 256 },
      firstSeenAt: { type: Date, default: null },
      lastSeenAt: { type: Date, default: null },
    },

    archived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: ObjectId, ref: 'User', default: null },

    createdBy: { type: ObjectId, ref: 'User', required: true },
    updatedBy: { type: ObjectId, ref: 'User', required: true },
    /** Optimistic concurrency: every write increments it; updates must present the revision they read. */
    revision: { type: Number, default: 1 },
  },
  { timestamps: true, versionKey: false },
)

const nameCollation = { locale: 'en', strength: 2 }

// Inventory listings (default: non-archived) with each supported sort.
assetSchema.index({ organizationId: 1, archived: 1, name: 1 }, { collation: nameCollation, name: 'inventory_by_name' })
assetSchema.index({ organizationId: 1, archived: 1, criticalityRank: -1, name: 1 })
assetSchema.index({ organizationId: 1, archived: 1, updatedAt: -1 })
assetSchema.index({ organizationId: 1, archived: 1, createdAt: -1 })
// Filters.
assetSchema.index({ organizationId: 1, tags: 1 })
assetSchema.index({ organizationId: 1, type: 1, environment: 1 })
// One live asset per identifier within an organization (archived assets don't block reuse).
assetSchema.index(
  { organizationId: 1, identifierKeys: 1 },
  {
    unique: true,
    partialFilterExpression: { archived: false, 'identifierKeys.0': { $exists: true } },
    name: 'unique_live_identifier',
  },
)
// Reserved for scanners/integrations: one record per external id per source.
assetSchema.index(
  { organizationId: 1, 'discovery.source': 1, 'discovery.externalId': 1 },
  { unique: true, partialFilterExpression: { 'discovery.externalId': { $type: 'string' } }, name: 'unique_external_id' },
)

export const ASSET_NAME_COLLATION = nameCollation

export const Asset = mongoose.models.Asset ?? mongoose.model('Asset', assetSchema)
