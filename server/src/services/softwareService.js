import { ASSET_CRITICALITIES, ASSET_TYPES, labelOf as assetLabel } from '../config/assets.js'
import { PERMISSIONS, roleHasPermission } from '../config/roles.js'
import { RATE_LIMITS } from '../config/security.js'
import {
  SOFTWARE_ECOSYSTEMS,
  SOFTWARE_LIMITS,
  SOFTWARE_RELATIONSHIPS,
  SOFTWARE_SCOPES,
  SOFTWARE_SOURCES,
  labelOf,
} from '../config/software.js'
import { Asset, SoftwareComponent, User, VulnerabilityMatch } from '../models/index.js'
import { errors } from '../utils/errors.js'
import { isObjectIdString } from '../utils/ids.js'
import { normalizeComponent } from '../utils/softwareIdentity.js'
import { AUDIT_ACTIONS } from './auditService.js'
import * as rateLimits from './rateLimitService.js'

const DUPLICATE_KEY = 11000
const NAME_COLLATION = { locale: 'en', strength: 2 }
const IDENTITY = ['ecosystem', 'name', 'vendor', 'version']
/** Validated, enumerated or identity fields whose before/after go into the audit log. */
const AUDITED = ['ecosystem', 'componentKey', 'versionNormalized', 'relationship', 'scope']

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Software inventory use cases. A component always belongs to one asset of
 * the caller's organization; every query is scoped by `organization._id`, so
 * ids from another tenant are simply not found.
 *
 * Permissions (checked in the routes, Phase 3 catalogue):
 *   read → assets:read; add / edit / remove → assets:update. A component is
 *   part of the asset's record, so whoever may edit the asset may maintain
 *   its software.
 */
export function createSoftwareService({ audit }) {
  // ── Lookups ───────────────────────────────────────────────────────────────

  async function findAsset(organizationId, assetId) {
    if (!isObjectIdString(assetId)) throw errors.notFound('Asset not found.')
    const asset = await Asset.findOne({ _id: assetId, organizationId }).select('name type criticality archived').lean()
    if (!asset) throw errors.notFound('Asset not found.')
    return asset
  }

  async function findComponent(organizationId, componentId) {
    if (!isObjectIdString(componentId)) throw errors.notFound('Component not found.')
    const component = await SoftwareComponent.findOne({ _id: componentId, organizationId }).lean()
    if (!component) throw errors.notFound('Component not found.')
    return component
  }

  const enforceWriteLimit = (organizationId) =>
    rateLimits.enforce(`software-write:org:${organizationId}`, RATE_LIMITS.softwareWriteOrganization, 'client')

  function identityOrThrow(input) {
    const result = normalizeComponent(input)
    if (result.fields) throw errors.validation(result.fields)
    return result
  }

  async function assertNotListed(organizationId, assetId, identity, excludeId = null) {
    const clash = await SoftwareComponent.exists({
      organizationId,
      assetId,
      componentKey: identity.componentKey,
      versionNormalized: identity.versionNormalized,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
    if (clash) throw errors.softwareComponentExists()
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  async function contextFor(organizationId, components) {
    const assetIds = [...new Set(components.map((c) => String(c.assetId)))]
    const userIds = [...new Set(components.flatMap((c) => [c.createdBy, c.updatedBy]).filter(Boolean).map(String))]
    const [assets, users] = await Promise.all([
      assetIds.length ? Asset.find({ _id: { $in: assetIds }, organizationId }).select('name type criticality archived').lean() : [],
      userIds.length ? User.find({ _id: { $in: userIds } }).select('fullName').lean() : [],
    ])
    return {
      assets: new Map(assets.map((a) => [String(a._id), a])),
      names: new Map(users.map((u) => [String(u._id), u.fullName])),
    }
  }

  function serialize(component, role, { assets, names }) {
    const asset = assets.get(String(component.assetId))
    const person = (id) => (id && names.has(String(id)) ? { id: String(id), fullName: names.get(String(id)) } : null)
    const canUpdate = roleHasPermission(role, PERMISSIONS.ASSETS_UPDATE) && !component.assetArchived
    return {
      id: String(component._id),
      asset: asset
        ? {
            id: String(asset._id),
            name: asset.name,
            type: asset.type,
            typeLabel: assetLabel(ASSET_TYPES, asset.type),
            criticality: asset.criticality,
            criticalityLabel: assetLabel(ASSET_CRITICALITIES, asset.criticality),
            archived: asset.archived,
          }
        : null,
      ecosystem: component.ecosystem,
      ecosystemLabel: labelOf(SOFTWARE_ECOSYSTEMS, component.ecosystem),
      name: component.name,
      vendor: component.vendor,
      packageKey: component.componentKey,
      version: component.version,
      versionNormalized: component.versionNormalized,
      purl: component.purl,
      relationship: component.relationship,
      relationshipLabel: labelOf(SOFTWARE_RELATIONSHIPS, component.relationship),
      scope: component.scope,
      scopeLabel: labelOf(SOFTWARE_SCOPES, component.scope),
      source: component.source,
      sourceLabel: labelOf(SOFTWARE_SOURCES, component.source),
      createdAt: component.createdAt,
      createdBy: person(component.createdBy),
      updatedAt: component.updatedAt,
      updatedBy: person(component.updatedBy),
      revision: component.revision,
      actions: { update: canUpdate, delete: canUpdate },
    }
  }

  async function present(organization, membership, component) {
    return serialize(component, membership.role, await contextFor(organization._id, [component]))
  }

  function record(ctx, action, { auth, organization, component, metadata }) {
    return audit.record(ctx, {
      action,
      outcome: 'success',
      userId: auth.user._id,
      organizationId: organization._id,
      resourceType: 'software_component',
      resourceId: component._id,
      metadata: { assetId: component.assetId, ...metadata },
    })
  }

  const changes = (from, to) =>
    AUDITED.filter((field) => (from?.[field] ?? null) !== (to?.[field] ?? null)).map((field) => ({
      field,
      from: from?.[field] ?? null,
      to: to?.[field] ?? null,
    }))

  // ── Queries ───────────────────────────────────────────────────────────────

  function buildFilter(organizationId, query) {
    // An asset's own list includes it even when archived (read-only); otherwise only the live inventory.
    const filter = query.assetId ? { organizationId, assetId: query.assetId } : { organizationId, assetArchived: false }
    for (const key of ['ecosystem', 'relationship', 'scope']) {
      if (query[key]?.length) filter[key] = { $in: query[key] }
    }
    if (query.version === 'unknown') filter.versionNormalized = null
    if (query.version === 'known') filter.versionNormalized = { $ne: null }
    if (query.q) {
      // Matched literally: user text is escaped, never interpreted as a pattern.
      const pattern = new RegExp(escapeRegex(query.q), 'i')
      filter.$or = [{ name: pattern }, { componentKey: pattern }, { vendor: pattern }, { purl: pattern }]
    }
    return filter
  }

  function buildSort({ sort, order }) {
    const dir = (fallback) => ((order ?? fallback) === 'asc' ? 1 : -1)
    switch (sort) {
      case 'createdAt':
      case 'updatedAt':
        return { [sort]: dir('desc'), _id: 1 }
      case 'ecosystem':
        return { ecosystem: dir('asc'), name: 1, versionNormalized: 1, _id: 1 }
      default:
        return { name: dir('asc'), versionNormalized: 1, _id: 1 }
    }
  }

  async function list({ organization, membership }, query) {
    if (query.assetId) await findAsset(organization._id, query.assetId)
    const filter = buildFilter(organization._id, query)
    const skip = (query.page - 1) * query.pageSize
    const [components, total] = await Promise.all([
      SoftwareComponent.find(filter).collation(NAME_COLLATION).sort(buildSort(query)).skip(skip).limit(query.pageSize).lean(),
      SoftwareComponent.countDocuments(filter),
    ])
    const context = await contextFor(organization._id, components)
    return {
      components: components.map((c) => serialize(c, membership.role, context)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      sort: query.sort,
      order: query.order ?? (['createdAt', 'updatedAt'].includes(query.sort) ? 'desc' : 'asc'),
    }
  }

  /** Counts over the live inventory (components of archived assets excluded). */
  async function summary({ organization }) {
    const [result] = await SoftwareComponent.aggregate([
      { $match: { organizationId: organization._id, assetArchived: false } },
      {
        $facet: {
          total: [{ $count: 'n' }],
          assets: [{ $group: { _id: '$assetId' } }, { $count: 'n' }],
          unknownVersions: [{ $match: { versionNormalized: null } }, { $count: 'n' }],
          byEcosystem: [{ $group: { _id: '$ecosystem', n: { $sum: 1 } } }],
          packages: [
            {
              $group: {
                _id: '$componentKey',
                ecosystem: { $first: '$ecosystem' },
                name: { $first: '$name' },
                assets: { $addToSet: '$assetId' },
                versions: { $addToSet: '$versionNormalized' },
              },
            },
            { $project: { ecosystem: 1, name: 1, assets: { $size: '$assets' }, versions: { $size: '$versions' } } },
            { $sort: { assets: -1, versions: -1, _id: 1 } },
          ],
        },
      },
      {
        $project: {
          total: 1,
          assets: 1,
          unknownVersions: 1,
          byEcosystem: 1,
          packageCount: { $size: '$packages' },
          multiVersion: { $size: { $filter: { input: '$packages', cond: { $gt: ['$$this.versions', 1] } } } },
          topPackages: { $slice: ['$packages', 8] },
        },
      },
    ])
    const count = (facet) => facet[0]?.n ?? 0
    return {
      total: count(result.total),
      packages: result.packageCount,
      assets: count(result.assets),
      unknownVersions: count(result.unknownVersions),
      multiVersionPackages: result.multiVersion,
      byEcosystem: Object.fromEntries(SOFTWARE_ECOSYSTEMS.map((e) => [e.value, result.byEcosystem.find((b) => b._id === e.value)?.n ?? 0])),
      topPackages: result.topPackages.map((p) => ({
        packageKey: p._id,
        ecosystem: p.ecosystem,
        ecosystemLabel: labelOf(SOFTWARE_ECOSYSTEMS, p.ecosystem),
        name: p.name,
        assets: p.assets,
        versions: p.versions,
      })),
    }
  }

  async function get({ organization, membership }, componentId) {
    return present(organization, membership, await findComponent(organization._id, componentId))
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  async function create({ organization, membership }, assetId, body, auth, ctx) {
    const asset = await findAsset(organization._id, assetId)
    if (asset.archived) throw errors.assetArchived()
    const identity = identityOrThrow(body)
    await enforceWriteLimit(organization._id)

    const [onAsset, inOrganization] = await Promise.all([
      SoftwareComponent.countDocuments({ organizationId: organization._id, assetId: asset._id }),
      SoftwareComponent.countDocuments({ organizationId: organization._id }),
    ])
    if (onAsset >= SOFTWARE_LIMITS.perAsset) throw errors.softwareLimitReached('asset')
    if (inOrganization >= SOFTWARE_LIMITS.perOrganization) throw errors.softwareLimitReached('organization')
    await assertNotListed(organization._id, asset._id, identity)

    let component
    try {
      component = await SoftwareComponent.create({
        organizationId: organization._id,
        assetId: asset._id,
        assetArchived: false,
        ecosystem: body.ecosystem,
        ...identity,
        relationship: body.relationship,
        scope: body.scope,
        source: 'manual',
        createdBy: auth.user._id,
        updatedBy: auth.user._id,
      })
    } catch (error) {
      // Lost a race with a concurrent create of the same package version.
      if (error?.code === DUPLICATE_KEY) throw errors.softwareComponentExists()
      throw error
    }

    await record(ctx, AUDIT_ACTIONS.SOFTWARE_CREATE, { auth, organization, component, metadata: { changes: changes(null, component) } })
    return present(organization, membership, component.toObject())
  }

  async function update({ organization, membership }, componentId, body, auth, ctx) {
    const current = await findComponent(organization._id, componentId)
    if (current.assetArchived) throw errors.assetArchived()
    if (body.revision !== current.revision) throw errors.softwareConflict()

    const set = {}
    if (IDENTITY.some((key) => body[key] !== undefined)) {
      const ecosystem = body.ecosystem ?? current.ecosystem
      const identity = identityOrThrow({
        ecosystem,
        name: body.name ?? current.name,
        // Moving away from "other software" drops the vendor.
        vendor: ecosystem === 'generic' ? (body.vendor ?? current.vendor ?? '') : (body.vendor ?? ''),
        version: body.version !== undefined ? body.version : current.version,
      })
      Object.assign(set, { ecosystem, ...identity })
    }
    for (const key of ['relationship', 'scope']) if (body[key] !== undefined) set[key] = body[key]

    const changed = Object.keys(set).filter((key) => (set[key] ?? null) !== (current[key] ?? null))
    if (changed.length === 0) return present(organization, membership, current)
    await enforceWriteLimit(organization._id)
    if (set.componentKey !== undefined) {
      await assertNotListed(organization._id, current.assetId, { componentKey: set.componentKey, versionNormalized: set.versionNormalized }, current._id)
    }

    let updated
    try {
      updated = await SoftwareComponent.findOneAndUpdate(
        // Atomic: only the revision the client read, and never under an archived asset.
        { _id: current._id, organizationId: organization._id, revision: current.revision, assetArchived: false },
        { $set: { ...set, updatedBy: auth.user._id }, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true },
      ).lean()
    } catch (error) {
      if (error?.code === DUPLICATE_KEY) throw errors.softwareComponentExists()
      throw error
    }
    if (!updated) throw errors.softwareConflict()

    // The identity that was matched has changed, so the stored matches no longer describe this
    // component. They are dropped here and rebuilt by the next matching run.
    if (IDENTITY.some((key) => changed.includes(key)) || changed.includes('componentKey') || changed.includes('versionNormalized')) {
      await VulnerabilityMatch.deleteMany({ organizationId: organization._id, componentId: current._id })
    }

    await record(ctx, AUDIT_ACTIONS.SOFTWARE_UPDATE, {
      auth,
      organization,
      component: updated,
      metadata: { fields: changed.filter((key) => !['componentKey', 'versionNormalized', 'purl'].includes(key)), changes: changes(current, updated) },
    })
    return present(organization, membership, updated)
  }

  async function remove({ organization }, componentId, auth, ctx) {
    const current = await findComponent(organization._id, componentId)
    if (current.assetArchived) throw errors.assetArchived()
    await enforceWriteLimit(organization._id)
    const result = await SoftwareComponent.deleteOne({ _id: current._id, organizationId: organization._id, assetArchived: false })
    if (result.deletedCount === 0) throw errors.softwareConflict()
    await VulnerabilityMatch.deleteMany({ organizationId: organization._id, componentId: current._id })
    await record(ctx, AUDIT_ACTIONS.SOFTWARE_DELETE, { auth, organization, component: current, metadata: { changes: changes(current, null) } })
    return { ok: true }
  }

  return { list, summary, get, create, update, remove }
}
