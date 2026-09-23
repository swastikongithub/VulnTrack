import { MATCH_LIMITS, MATCH_STATUSES } from '../../config/matching.js'
import { Asset, MatchingRun, SoftwareComponent, Vulnerability } from '../../models/index.js'
import { AUDIT_ACTIONS } from '../auditService.js'
import { evaluateMatch } from './matchEngine.js'
import { pruneMatches, storeMatch } from './matchStore.js'

/**
 * Recomputes one organization's matches (master plan §30).
 *
 *   inventory  every software component the organization records
 *   catalogue  active advisories naming the same package (componentKey), or
 *              the same vendor/product (CPE, for software outside a registry)
 *   engine     pure, deterministic evaluation of each pair
 *   store      idempotent upsert, then prune of anything not re-confirmed
 *
 * The whole organization is recomputed in one pass. That keeps the result a
 * pure function of the current inventory and catalogue: no incremental state
 * to drift, and re-running always converges. Components are streamed in
 * batches so memory stays flat on large inventories.
 *
 * Withdrawn and rejected advisories are excluded: they are not claims about
 * anything any more.
 *
 * Failure model mirrors the ingestion worker: one run per organization at a
 * time (database lock), stale runs recovered, every run audited.
 */

export class MatchingBusyError extends Error {}

const STALE_AFTER_MS = 15 * 60 * 1000
const ADVISORY_FIELDS = {
  source: 1,
  sourceId: 1,
  severity: 1,
  severityRank: 1,
  cvssScore: 1,
  knownExploited: 1,
  summary: 1,
}

/** CPE writes spaces as underscores; try both forms of a product name. */
const productForms = (name) => {
  const text = String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return [text, text.replace(/ /g, '_')]
}

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))

export function createMatchRunner({ audit, logger, now = () => new Date() } = {}) {
  async function recoverStale(organizationId) {
    const cutoff = new Date(now().getTime() - STALE_AFTER_MS)
    await MatchingRun.updateMany(
      { organizationId, status: 'running', heartbeatAt: { $lt: cutoff } },
      { $set: { status: 'failed', finishedAt: now(), error: 'Abandoned: the run stopped reporting progress.' } },
    )
  }

  /** Advisories that name any of these packages, keyed by componentKey. */
  async function advisoriesByPackage(componentKeys) {
    const byKey = new Map(componentKeys.map((key) => [key, []]))
    if (!componentKeys.length) return byKey
    const advisories = await Vulnerability.find(
      { status: 'active', 'affectedPackages.componentKey': { $in: componentKeys } },
      { ...ADVISORY_FIELDS, affectedPackages: 1 },
    ).lean()
    for (const advisory of advisories) {
      for (const key of new Set(advisory.affectedPackages.map((p) => p.componentKey).filter(Boolean))) {
        byKey.get(key)?.push(advisory)
      }
    }
    return byKey
  }

  /** Advisories whose CPE products match any of these product names. */
  async function advisoriesByProduct(names) {
    if (!names.length) return []
    return Vulnerability.find(
      { status: 'active', 'affectedProducts.product': { $in: [...new Set(names.flatMap(productForms))] } },
      { ...ADVISORY_FIELDS, affectedProducts: 1 },
    ).lean()
  }

  /**
   * @param organization the resolved organization document (tenant boundary)
   * @param options { trigger, actorUserId }
   */
  async function run(organization, { trigger = 'api', actorUserId = null, ctx } = {}) {
    const organizationId = organization._id
    await recoverStale(organizationId)

    const startedAt = now()
    let runDoc
    try {
      runDoc = await MatchingRun.create({ organizationId, trigger, actorUserId, startedAt, heartbeatAt: startedAt })
    } catch (error) {
      if (error?.code === 11000) throw new MatchingBusyError('A matching run is already in progress for this organization.')
      throw error
    }

    const counts = { components: 0, candidates: 0, evaluated: 0, affected: 0, unknownVersion: 0, undetermined: 0, created: 0, updated: 0, unchanged: 0, removed: 0 }
    const seenAdvisories = new Set()
    let status = 'succeeded'
    let errorMessage = null

    try {
      const componentIds = await SoftwareComponent.find({ organizationId }, { _id: 1 }).sort({ _id: 1 }).lean()
      for (const batchIds of chunk(componentIds.map((c) => c._id), MATCH_LIMITS.componentBatch)) {
        const components = await SoftwareComponent.find({ _id: { $in: batchIds } }).lean()
        counts.components += components.length

        const assets = await Asset.find({ _id: { $in: [...new Set(components.map((c) => String(c.assetId)))] } }, { name: 1 }).lean()
        const assetNames = new Map(assets.map((asset) => [String(asset._id), asset.name]))

        const byKey = await advisoriesByPackage([...new Set(components.map((c) => c.componentKey))])
        const generics = components.filter((c) => c.ecosystem === 'generic')
        const productAdvisories = await advisoriesByProduct(generics.map((c) => c.name))

        for (const component of components) {
          // The package and CPE queries can return the same advisory as different objects: dedupe by id.
          const candidates = new Map()
          for (const advisory of [...(byKey.get(component.componentKey) ?? []), ...(component.ecosystem === 'generic' ? productAdvisories : [])]) {
            const existing = candidates.get(String(advisory._id))
            candidates.set(String(advisory._id), existing ? { ...existing, ...advisory } : advisory)
          }
          for (const advisory of candidates.values()) {
            counts.candidates++
            const outcome = evaluateMatch(component, advisory)
            if (!outcome) continue
            counts.evaluated++
            if (outcome.status === MATCH_STATUSES.AFFECTED) counts.affected++
            else if (outcome.status === MATCH_STATUSES.UNKNOWN_VERSION) counts.unknownVersion++
            else counts.undetermined++
            seenAdvisories.add(String(advisory._id))

            const result = await storeMatch(
              {
                organizationId,
                assetId: component.assetId,
                assetArchived: component.assetArchived,
                assetName: assetNames.get(String(component.assetId)) ?? 'Unknown asset',
                componentId: component._id,
                componentKey: component.componentKey,
                ecosystem: component.ecosystem,
                packageName: component.name,
                version: component.version,
                versionNormalized: component.versionNormalized,
                vulnerabilityId: advisory._id,
                source: advisory.source,
                sourceId: advisory.sourceId,
                severity: advisory.severity,
                severityRank: advisory.severityRank,
                cvssScore: advisory.cvssScore ?? null,
                knownExploited: Boolean(advisory.knownExploited),
                summary: advisory.summary ?? '',
                status: outcome.status,
                confidence: outcome.confidence,
                route: outcome.via,
                reason: outcome.reason,
                fixedVersions: outcome.fixedVersions ?? [],
              },
              { runId: runDoc._id, now: now() },
            )
            counts[result]++

            if (counts.created + counts.updated + counts.unchanged > MATCH_LIMITS.perOrganization) {
              throw new Error(`Matching stopped: more than ${MATCH_LIMITS.perOrganization} matches for one organization.`)
            }
          }
        }
        await MatchingRun.updateOne({ _id: runDoc._id }, { $set: { heartbeatAt: now(), counts } })
      }
      counts.removed = await pruneMatches(organizationId, runDoc._id)
    } catch (error) {
      status = 'failed'
      errorMessage = `${error?.message ?? error}`.slice(0, 500)
      logger?.error({ err: error, organizationId: String(organizationId) }, 'Matching run failed')
    }

    const finishedAt = now()
    await MatchingRun.updateOne({ _id: runDoc._id }, { $set: { status, counts, error: errorMessage, finishedAt, heartbeatAt: finishedAt } })

    await audit?.record(ctx ?? {}, {
      action: AUDIT_ACTIONS.MATCHING_RUN,
      outcome: status === 'failed' ? 'failure' : 'success',
      reason: status,
      userId: actorUserId,
      organizationId,
      resourceType: 'matching_run',
      resourceId: runDoc._id,
      metadata: { count: counts.created + counts.updated },
    })

    return { id: String(runDoc._id), organizationId: String(organizationId), status, counts: { ...counts }, advisories: seenAdvisories.size, error: errorMessage, startedAt, finishedAt }
  }

  return { run }
}
