import {
  ASSET_CRITICALITIES,
  ASSET_DISCOVERY_SOURCES,
  ASSET_ENVIRONMENTS,
  ASSET_EXPOSURES,
  ASSET_IDENTIFIER_KINDS,
  ASSET_LIMITS,
  ASSET_STATUS_TRANSITIONS,
  ASSET_STATUSES,
  ASSET_TYPES,
  labelOf,
} from '../config/assets.js'
import { PERMISSIONS, roleHasPermission } from '../config/roles.js'
import { RATE_LIMITS } from '../config/security.js'
import mongoose from 'mongoose'
import { Asset, ASSET_NAME_COLLATION, Membership, SoftwareComponent, User } from '../models/index.js'
import { identifierKey, normalizeIdentifier } from '../utils/assetIdentifiers.js'
import { errors } from '../utils/errors.js'
import { isObjectIdString } from '../utils/ids.js'
import { AUDIT_ACTIONS } from './auditService.js'
import * as rateLimits from './rateLimitService.js'

const DUPLICATE_KEY = 11000
const RANK = Object.fromEntries(ASSET_CRITICALITIES.map((c) => [c.value, c.rank]))
/** Enumerated fields whose before/after values are safe to put in the audit log. */
const AUDITED_CHANGES = ['type', 'environment', 'criticality', 'exposure', 'status']
const EDITABLE = ['name', 'description', 'type', 'environment', 'criticality', 'exposure', 'status', 'identifiers', 'tags', 'technologies', 'owner']

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Asset inventory use cases. `context` is the caller's resolved
 * `{ organization, membership }` (authorize middleware); every query is scoped
 * by `organization._id`, so an asset id from another tenant is simply not found.
 * Permission checks happen in the routes; this service applies the business
 * rules (identifier uniqueness, lifecycle, archive state, concurrency).
 */
export function createAssetService({ audit }) {
  // ── Normalization & validation rules ─────────────────────────────────────

  function normalizeIdentifiers(input) {
    const fields = {}
    const identifiers = []
    const keys = new Map()
    input.forEach((item, index) => {
      const result = normalizeIdentifier(item.kind, item.value)
      if (result.error) {
        fields[`identifiers.${index}.value`] = result.error
        return
      }
      const key = identifierKey(item.kind, result.normalized)
      if (keys.has(key)) {
        fields[`identifiers.${index}.value`] = 'This identifier is listed twice'
        return
      }
      keys.set(key, index)
      identifiers.push({ kind: item.kind, value: result.value, normalized: result.normalized })
    })
    if (Object.keys(fields).length) throw errors.validation(fields)
    return { identifiers, identifierKeys: [...keys.keys()], indexByKey: keys }
  }

  async function assertContactIsMember(organizationId, contactUserId) {
    if (!contactUserId) return null
    const member = await Membership.exists({ organizationId, userId: contactUserId, status: 'active' })
    if (!member) throw errors.validation({ 'owner.contactUserId': 'Choose a current member of this organization' })
    return contactUserId
  }

  async function assertIdentifiersAvailable(organizationId, normalized, excludeId = null) {
    if (normalized.identifierKeys.length === 0) return
    const clash = await Asset.findOne({
      organizationId,
      archived: false,
      identifierKeys: { $in: normalized.identifierKeys },
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
      .select('identifierKeys')
      .lean()
    if (!clash) return
    const fields = {}
    for (const key of clash.identifierKeys) {
      if (normalized.indexByKey.has(key)) fields[`identifiers.${normalized.indexByKey.get(key)}.value`] = 'Another asset already uses this identifier'
    }
    throw errors.assetIdentifierExists(fields)
  }

  function assertTransition(from, to) {
    if (from === to) return
    if (!ASSET_STATUS_TRANSITIONS[from]?.includes(to)) {
      throw errors.validation({ status: `An asset can't move from ${labelOf(ASSET_STATUSES, from)} to ${labelOf(ASSET_STATUSES, to)}` })
    }
  }

  const enforceWriteLimit = (organizationId) =>
    rateLimits.enforce(`asset-write:org:${organizationId}`, RATE_LIMITS.assetWriteOrganization, 'client')

  // ── Serialization ─────────────────────────────────────────────────────────

  function actionsFor(role, asset) {
    const canUpdate = roleHasPermission(role, PERMISSIONS.ASSETS_UPDATE)
    const canDelete = roleHasPermission(role, PERMISSIONS.ASSETS_DELETE)
    return {
      update: canUpdate && !asset.archived,
      archive: canDelete && !asset.archived,
      restore: canDelete && asset.archived,
      delete: canDelete && asset.archived,
    }
  }

  /** Resolves people referenced by assets. Contacts are shown only while they're still active members. */
  async function peopleFor(organizationId, assets) {
    const ids = new Set()
    const contactIds = new Set()
    for (const asset of assets) {
      for (const id of [asset.createdBy, asset.updatedBy, asset.archivedBy]) if (id) ids.add(String(id))
      if (asset.owner?.contactUserId) contactIds.add(String(asset.owner.contactUserId))
    }
    const activeContacts = contactIds.size
      ? new Set(
          (await Membership.find({ organizationId, userId: { $in: [...contactIds] }, status: 'active' }).select('userId').lean()).map(
            (m) => String(m.userId),
          ),
        )
      : new Set()
    for (const id of activeContacts) ids.add(id)
    const users = ids.size ? await User.find({ _id: { $in: [...ids] } }).select('fullName').lean() : []
    const names = new Map(users.map((u) => [String(u._id), u.fullName]))
    const person = (id) => (id && names.has(String(id)) ? { id: String(id), fullName: names.get(String(id)) } : null)
    return { person, isActiveContact: (id) => Boolean(id) && activeContacts.has(String(id)) }
  }

  function serialize(asset, role, people) {
    const contactId = asset.owner?.contactUserId
    return {
      id: String(asset._id),
      name: asset.name,
      description: asset.description,
      type: asset.type,
      typeLabel: labelOf(ASSET_TYPES, asset.type),
      environment: asset.environment,
      environmentLabel: labelOf(ASSET_ENVIRONMENTS, asset.environment),
      criticality: asset.criticality,
      criticalityLabel: labelOf(ASSET_CRITICALITIES, asset.criticality),
      exposure: asset.exposure,
      exposureLabel: labelOf(ASSET_EXPOSURES, asset.exposure),
      status: asset.status,
      statusLabel: labelOf(ASSET_STATUSES, asset.status),
      identifiers: asset.identifiers.map(({ kind, value }) => ({ kind, kindLabel: labelOf(ASSET_IDENTIFIER_KINDS, kind), value })),
      tags: asset.tags,
      technologies: asset.technologies,
      owner: {
        team: asset.owner?.team ?? '',
        // A contact who has left the organization is not disclosed; the UI shows "no longer a member".
        contact: people.isActiveContact(contactId) ? { userId: String(contactId), fullName: people.person(contactId)?.fullName ?? '' } : null,
        contactRemoved: Boolean(contactId) && !people.isActiveContact(contactId),
      },
      discovery: {
        source: asset.discovery?.source ?? 'manual',
        sourceLabel: labelOf(ASSET_DISCOVERY_SOURCES, asset.discovery?.source ?? 'manual'),
        firstSeenAt: asset.discovery?.firstSeenAt ?? null,
        lastSeenAt: asset.discovery?.lastSeenAt ?? null,
      },
      archived: asset.archived,
      archivedAt: asset.archivedAt,
      archivedBy: people.person(asset.archivedBy),
      createdAt: asset.createdAt,
      createdBy: people.person(asset.createdBy),
      updatedAt: asset.updatedAt,
      updatedBy: people.person(asset.updatedBy),
      revision: asset.revision,
      actions: actionsFor(role, asset),
    }
  }

  async function present(organization, membership, asset) {
    const people = await peopleFor(organization._id, [asset])
    return serialize(asset, membership.role, people)
  }

  async function findInOrganization(organizationId, assetId) {
    if (!isObjectIdString(assetId)) throw errors.notFound('Asset not found.')
    const asset = await Asset.findOne({ _id: assetId, organizationId }).lean()
    if (!asset) throw errors.notFound('Asset not found.')
    return asset
  }

  function record(ctx, action, { auth, organization, asset, outcome = 'success', reason = null, metadata }) {
    return audit.record(ctx, {
      action,
      outcome,
      userId: auth.user._id,
      organizationId: organization._id,
      resourceType: 'asset',
      resourceId: asset?._id ?? null,
      reason,
      metadata,
    })
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  function buildFilter(organizationId, query) {
    const filter = { organizationId, archived: query.archived === 'true' }
    for (const key of ['type', 'environment', 'criticality', 'exposure', 'status']) {
      if (query[key]?.length) filter[key] = { $in: query[key] }
    }
    if (query.tag) filter.tags = query.tag
    if (query.q) {
      // User text is escaped: it is matched literally, never interpreted as a pattern.
      const pattern = new RegExp(escapeRegex(query.q), 'i')
      filter.$or = [
        { name: pattern },
        { 'identifiers.value': pattern },
        { tags: pattern },
        { technologies: pattern },
        { 'owner.team': pattern },
      ]
    }
    return filter
  }

  function buildSort({ sort, order }) {
    const dir = (fallback) => ((order ?? fallback) === 'asc' ? 1 : -1)
    switch (sort) {
      case 'criticality':
        return { criticalityRank: dir('desc'), name: 1, _id: 1 }
      case 'createdAt':
      case 'updatedAt':
        return { [sort]: dir('desc'), _id: 1 }
      case 'type':
      case 'environment':
      case 'status':
        return { [sort]: dir('asc'), name: 1, _id: 1 }
      default:
        return { name: dir('asc'), _id: 1 }
    }
  }

  async function list({ organization, membership }, query) {
    const filter = buildFilter(organization._id, query)
    const skip = (query.page - 1) * query.pageSize
    const [assets, total] = await Promise.all([
      Asset.find(filter).collation(ASSET_NAME_COLLATION).sort(buildSort(query)).skip(skip).limit(query.pageSize).lean(),
      Asset.countDocuments(filter),
    ])
    const people = await peopleFor(organization._id, assets)
    return {
      assets: assets.map((asset) => serialize(asset, membership.role, people)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      sort: query.sort,
      order: query.order ?? (['criticality', 'createdAt', 'updatedAt'].includes(query.sort) ? 'desc' : 'asc'),
    }
  }

  /** Inventory counts for the current organization (not filtered). */
  async function summary({ organization }) {
    const [result] = await Asset.aggregate([
      { $match: { organizationId: organization._id } },
      {
        $facet: {
          archived: [{ $match: { archived: true } }, { $count: 'n' }],
          active: [{ $match: { archived: false } }, { $count: 'n' }],
          internetFacing: [{ $match: { archived: false, exposure: 'internet_facing' } }, { $count: 'n' }],
          byCriticality: [{ $match: { archived: false } }, { $group: { _id: '$criticality', n: { $sum: 1 } } }],
          byEnvironment: [{ $match: { archived: false } }, { $group: { _id: '$environment', n: { $sum: 1 } } }],
          tags: [
            { $match: { archived: false } },
            { $unwind: '$tags' },
            { $group: { _id: '$tags', n: { $sum: 1 } } },
            { $sort: { n: -1, _id: 1 } },
            { $limit: 50 },
          ],
        },
      },
    ])
    const count = (facet) => facet[0]?.n ?? 0
    const byValue = (facet, entries) => Object.fromEntries(entries.map((e) => [e.value, facet.find((f) => f._id === e.value)?.n ?? 0]))
    return {
      total: count(result.active),
      archived: count(result.archived),
      internetFacing: count(result.internetFacing),
      byCriticality: byValue(result.byCriticality, ASSET_CRITICALITIES),
      byEnvironment: byValue(result.byEnvironment, ASSET_ENVIRONMENTS),
      tags: result.tags.map((t) => ({ tag: t._id, count: t.n })),
    }
  }

  async function get({ organization, membership }, assetId) {
    return present(organization, membership, await findInOrganization(organization._id, assetId))
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  async function create({ organization, membership }, body, auth, ctx) {
    await enforceWriteLimit(organization._id)
    if ((await Asset.countDocuments({ organizationId: organization._id })) >= ASSET_LIMITS.perOrganization) {
      throw errors.assetLimitReached()
    }

    const normalized = normalizeIdentifiers(body.identifiers)
    const contactUserId = await assertContactIsMember(organization._id, body.owner.contactUserId)
    await assertIdentifiersAvailable(organization._id, normalized)

    const now = new Date()
    let asset
    try {
      asset = await Asset.create({
        organizationId: organization._id,
        name: body.name,
        description: body.description,
        type: body.type,
        environment: body.environment,
        criticality: body.criticality,
        criticalityRank: RANK[body.criticality],
        exposure: body.exposure,
        status: body.status,
        identifiers: normalized.identifiers,
        identifierKeys: normalized.identifierKeys,
        tags: body.tags,
        technologies: body.technologies,
        owner: { team: body.owner.team ?? '', contactUserId },
        discovery: { source: 'manual', firstSeenAt: now },
        createdBy: auth.user._id,
        updatedBy: auth.user._id,
      })
    } catch (error) {
      // Lost a race with a concurrent create using the same identifier.
      if (error?.code === DUPLICATE_KEY) throw errors.assetIdentifierExists({})
      throw error
    }

    await record(ctx, AUDIT_ACTIONS.ASSET_CREATE, {
      auth,
      organization,
      asset,
      metadata: { changes: AUDITED_CHANGES.map((field) => ({ field, from: null, to: asset[field] })) },
    })
    return present(organization, membership, asset.toObject())
  }

  async function update({ organization, membership }, assetId, body, auth, ctx) {
    const current = await findInOrganization(organization._id, assetId)
    if (current.archived) throw errors.assetArchived()
    if (body.revision !== current.revision) throw errors.assetConflict()
    await enforceWriteLimit(organization._id)

    const set = {}
    for (const key of EDITABLE) {
      if (body[key] === undefined) continue
      if (key === 'identifiers') {
        const normalized = normalizeIdentifiers(body.identifiers)
        await assertIdentifiersAvailable(organization._id, normalized, current._id)
        set.identifiers = normalized.identifiers
        set.identifierKeys = normalized.identifierKeys
      } else if (key === 'owner') {
        // Partial owner updates keep the other owner field.
        if (body.owner.team !== undefined) set['owner.team'] = body.owner.team
        if (body.owner.contactUserId !== undefined) {
          const unchanged = String(body.owner.contactUserId) === String(current.owner?.contactUserId)
          set['owner.contactUserId'] = unchanged ? current.owner.contactUserId : await assertContactIsMember(organization._id, body.owner.contactUserId)
        }
      } else if (key === 'status') {
        assertTransition(current.status, body.status)
        set.status = body.status
      } else {
        set[key] = body[key]
        if (key === 'criticality') set.criticalityRank = RANK[body.criticality]
      }
    }

    const changedFields = Object.keys(set)
      .map((path) => path.split('.')[0])
      .filter((field, index, all) => all.indexOf(field) === index && field !== 'identifierKeys' && field !== 'criticalityRank')
      .filter((field) =>
        field === 'owner'
          ? ('owner.team' in set && set['owner.team'] !== (current.owner?.team ?? '')) ||
            ('owner.contactUserId' in set && String(set['owner.contactUserId']) !== String(current.owner?.contactUserId ?? null))
          : !same(set[field], current[field]),
      )
    if (changedFields.length === 0) return present(organization, membership, current)

    let updated
    try {
      updated = await Asset.findOneAndUpdate(
        // Atomic: only applies to the revision the client read, and never to an archived asset.
        { _id: current._id, organizationId: organization._id, revision: current.revision, archived: false },
        { $set: { ...set, updatedBy: auth.user._id }, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true },
      ).lean()
    } catch (error) {
      if (error?.code === DUPLICATE_KEY) throw errors.assetIdentifierExists({})
      throw error
    }
    if (!updated) throw errors.assetConflict()

    await record(ctx, AUDIT_ACTIONS.ASSET_UPDATE, {
      auth,
      organization,
      asset: updated,
      metadata: {
        fields: changedFields,
        changes: AUDITED_CHANGES.filter((f) => changedFields.includes(f)).map((field) => ({ field, from: current[field], to: updated[field] })),
      },
    })
    return present(organization, membership, updated)
  }

  async function setArchived({ organization, membership }, assetId, archived, body, auth, ctx) {
    const current = await findInOrganization(organization._id, assetId)
    if (current.archived === archived) throw archived ? errors.assetArchived() : errors.assetNotArchived()
    if (body.revision !== undefined && body.revision !== current.revision) throw errors.assetConflict()
    await enforceWriteLimit(organization._id)

    // Restoring puts identifiers back into the live uniqueness space; they may have been reused meanwhile.
    if (!archived) {
      const keys = current.identifierKeys ?? []
      await assertIdentifiersAvailable(organization._id, { identifierKeys: keys, indexByKey: new Map(keys.map((k, i) => [k, i])) }, current._id)
    }

    let updated
    try {
      // The asset's software follows it in and out of the live inventory (same transaction).
      updated = await mongoose.connection.transaction(async (session) => {
        const next = await Asset.findOneAndUpdate(
          { _id: current._id, organizationId: organization._id, revision: current.revision, archived: !archived },
          {
            $set: {
              archived,
              archivedAt: archived ? new Date() : null,
              archivedBy: archived ? auth.user._id : null,
              updatedBy: auth.user._id,
            },
            $inc: { revision: 1 },
          },
          { returnDocument: 'after', session },
        ).lean()
        if (next) {
          await SoftwareComponent.updateMany({ organizationId: organization._id, assetId: current._id }, { $set: { assetArchived: archived } }, { session })
        }
        return next
      })
    } catch (error) {
      if (error?.code === DUPLICATE_KEY) throw errors.assetIdentifierExists({})
      throw error
    }
    if (!updated) throw errors.assetConflict()

    await record(ctx, archived ? AUDIT_ACTIONS.ASSET_ARCHIVE : AUDIT_ACTIONS.ASSET_RESTORE, { auth, organization, asset: updated })
    return present(organization, membership, updated)
  }

  /**
   * Permanent deletion, only for archived assets. The asset's software
   * components have no meaning without it and are deleted in the same
   * transaction (the audit entry records how many). Findings, when they
   * exist, must be handled here too (block or cascade).
   */
  async function remove({ organization }, assetId, auth, ctx) {
    const current = await findInOrganization(organization._id, assetId)
    if (!current.archived) throw errors.assetNotArchived()
    await enforceWriteLimit(organization._id)
    const removedSoftware = await mongoose.connection.transaction(async (session) => {
      const result = await Asset.deleteOne({ _id: current._id, organizationId: organization._id, archived: true }, { session })
      if (result.deletedCount === 0) throw errors.assetConflict()
      const software = await SoftwareComponent.deleteMany({ organizationId: organization._id, assetId: current._id }, { session })
      return software.deletedCount
    })
    await record(ctx, AUDIT_ACTIONS.ASSET_DELETE, {
      auth,
      organization,
      asset: current,
      // Keeps the deleted asset's classification in the trail (enumerated values only).
      metadata: {
        changes: ['type', 'environment', 'criticality'].map((field) => ({ field, from: current[field], to: null })),
        count: removedSoftware,
      },
    })
    return { ok: true }
  }

  return {
    list,
    summary,
    get,
    create,
    update,
    archive: (context, assetId, body, auth, ctx) => setArchived(context, assetId, true, body, auth, ctx),
    restore: (context, assetId, body, auth, ctx) => setArchived(context, assetId, false, body, auth, ctx),
    remove,
  }
}
