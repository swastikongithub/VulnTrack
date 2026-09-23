import {
  MATCH_CONFIDENCE_ENTRIES,
  MATCH_ROUTES,
  MATCH_STATUS_ENTRIES,
  labelOf,
  values,
} from '../config/matching.js'
import { RATE_LIMITS } from '../config/security.js'
import { SOFTWARE_ECOSYSTEMS, labelOf as softwareLabel } from '../config/software.js'
import { SEVERITIES, VULNERABILITY_SOURCES, labelOf as vulnerabilityLabel } from '../config/vulnerabilities.js'
import { MatchingRun, SoftwareComponent, Vulnerability, VulnerabilityMatch } from '../models/index.js'
import { errors } from '../utils/errors.js'
import { isObjectIdString } from '../utils/ids.js'
import { MatchingBusyError } from './matching/matchRunner.js'
import * as rateLimits from './rateLimitService.js'

/**
 * Vulnerability matches: what the catalogue says about this organization's
 * software (master plan §30).
 *
 * Tenant-owned and tenant-scoped: every query filters `organizationId`, so a
 * match id from another organization is simply not found. The advisory behind
 * a match is global, but *that this organization runs the affected package* is
 * private to it.
 *
 * Read-only through the API apart from `recalculate`, which recomputes the
 * organization's matches. Matches are derived data: nothing here edits a
 * decision, and no workflow, assignment or risk score exists in this phase.
 */

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ASSET_NAME_COLLATION = { locale: 'en', strength: 2 }

const SORTS = {
  severity: () => ({ severityRank: -1, cvssScore: -1, _id: -1 }),
  asset: () => ({ assetName: 1, severityRank: -1, _id: -1 }),
  package: () => ({ packageName: 1, severityRank: -1, _id: -1 }),
  detected: () => ({ firstDetectedAt: -1, _id: -1 }),
}

const iso = (date) => (date ? new Date(date).toISOString() : null)

/** A short, human sentence for the decision; the client can render its own from `reason`. */
export function explain(match) {
  const { reason } = match
  const version = match.version ?? match.versionNormalized
  switch (reason.rule) {
    case 'range':
      return reason.end
        ? `Version ${version} is at or above ${reason.introduced === '0' ? 'the first release' : reason.introduced} and ${reason.endKind === 'lastAffected' ? `at or below ${reason.end}` : `below ${reason.end}`}.`
        : `Version ${version} is at or above ${reason.introduced === '0' ? 'the first release' : reason.introduced}, and the advisory names no fix.`
    case 'explicit_version':
      return `The advisory lists ${reason.version} as affected.`
    case 'version_unknown':
      return 'This component has no recorded version, so the advisory cannot be applied to it.'
    case 'unparsed_version':
      return `A version in the advisory’s range could not be read as ${reason.scheme}, so this could not be decided.`
    case 'unevaluated_range':
      return 'The advisory describes affected commits rather than versions, so this could not be decided.'
    case 'unordered_scheme':
      return 'Versions of this kind of software have no defined order, so the range could not be evaluated.'
    case 'no_version_information':
      return 'The advisory names this package but publishes no affected versions.'
    case 'cpe_version':
      return `NVD lists ${reason.version} of this product as affected.`
    case 'cpe_any_version':
      return 'NVD lists every version of this product as affected.'
    case 'cpe_unordered_range':
      return 'NVD gives a version range for this product, and versions of other software have no defined order here.'
    default:
      return 'See the advisory for details.'
  }
}

function serialize(match) {
  return {
    id: String(match._id),
    asset: { id: String(match.assetId), name: match.assetName, archived: match.assetArchived },
    component: {
      id: String(match.componentId),
      ecosystem: match.ecosystem,
      ecosystemLabel: softwareLabel(SOFTWARE_ECOSYSTEMS, match.ecosystem),
      name: match.packageName,
      packageKey: match.componentKey,
      version: match.version,
      versionNormalized: match.versionNormalized,
    },
    vulnerability: {
      id: String(match.vulnerabilityId),
      source: match.source,
      sourceLabel: vulnerabilityLabel(VULNERABILITY_SOURCES, match.source),
      sourceId: match.sourceId,
      summary: match.summary,
      severity: match.severity,
      severityLabel: vulnerabilityLabel(SEVERITIES, match.severity),
      cvssScore: match.cvssScore ?? null,
      knownExploited: match.knownExploited,
    },
    status: match.status,
    statusLabel: labelOf(MATCH_STATUS_ENTRIES, match.status),
    confidence: match.confidence,
    confidenceLabel: labelOf(MATCH_CONFIDENCE_ENTRIES, match.confidence),
    route: match.route,
    routeLabel: labelOf(MATCH_ROUTES, match.route),
    reason: { ...match.reason },
    explanation: explain(match),
    fixedVersions: match.fixedVersions ?? [],
    firstDetectedAt: iso(match.firstDetectedAt),
    lastEvaluatedAt: iso(match.lastEvaluatedAt),
  }
}

export function createMatchService({ runner }) {
  function buildFilter(organizationId, query) {
    const filter = { organizationId }
    filter.assetArchived = query.archived === 'true'
    if (query.status?.length) filter.status = { $in: query.status }
    if (query.confidence?.length) filter.confidence = { $in: query.confidence }
    if (query.severity?.length) filter.severity = { $in: query.severity }
    if (query.ecosystem?.length) filter.ecosystem = { $in: query.ecosystem }
    if (query.exploited) filter.knownExploited = true
    if (query.assetId) filter.assetId = query.assetId
    if (query.vulnerabilityId) filter.vulnerabilityId = query.vulnerabilityId
    if (query.q) {
      const pattern = new RegExp(escapeRegex(query.q), 'i')
      filter.$or = [{ packageName: pattern }, { sourceId: pattern }, { assetName: pattern }, { summary: pattern }]
    }
    return filter
  }

  async function list({ organization }, query) {
    if (query.assetId && !isObjectIdString(query.assetId)) throw errors.notFound('Asset not found.')
    const filter = buildFilter(organization._id, query)
    const skip = (query.page - 1) * query.pageSize

    const cursor = VulnerabilityMatch.find(filter).sort(SORTS[query.sort]()).skip(skip).limit(query.pageSize)
    if (query.sort === 'asset' || query.sort === 'package') cursor.collation(ASSET_NAME_COLLATION)

    const [matches, total] = await Promise.all([cursor.lean(), VulnerabilityMatch.countDocuments(filter)])
    return {
      matches: matches.map(serialize),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      sort: query.sort,
    }
  }

  /** Counts over live assets, plus the last run, for the page header. */
  async function summary({ organization }) {
    const [[counts], lastRun, components] = await Promise.all([
      VulnerabilityMatch.aggregate([
        { $match: { organizationId: organization._id, assetArchived: false } },
        {
          $facet: {
            total: [{ $count: 'n' }],
            byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
            bySeverity: [{ $match: { status: 'affected' } }, { $group: { _id: '$severity', n: { $sum: 1 } } }],
            byConfidence: [{ $group: { _id: '$confidence', n: { $sum: 1 } } }],
            exploited: [{ $match: { status: 'affected', knownExploited: true } }, { $count: 'n' }],
            assets: [{ $match: { status: 'affected' } }, { $group: { _id: '$assetId' } }, { $count: 'n' }],
            advisories: [{ $match: { status: 'affected' } }, { $group: { _id: '$vulnerabilityId' } }, { $count: 'n' }],
          },
        },
      ]),
      MatchingRun.findOne({ organizationId: organization._id }).sort({ startedAt: -1 }).lean(),
      SoftwareComponent.countDocuments({ organizationId: organization._id, assetArchived: false }),
    ])
    const n = (facet) => facet[0]?.n ?? 0
    const group = (facet, keys) => Object.fromEntries(keys.map((key) => [key, facet.find((entry) => entry._id === key)?.n ?? 0]))

    return {
      total: n(counts.total),
      byStatus: group(counts.byStatus, values(MATCH_STATUS_ENTRIES)),
      bySeverity: group(counts.bySeverity, values(SEVERITIES)),
      byConfidence: group(counts.byConfidence, values(MATCH_CONFIDENCE_ENTRIES)),
      knownExploited: n(counts.exploited),
      affectedAssets: n(counts.assets),
      advisories: n(counts.advisories),
      components,
      lastRun: lastRun
        ? {
            id: String(lastRun._id),
            status: lastRun.status,
            trigger: lastRun.trigger,
            startedAt: iso(lastRun.startedAt),
            finishedAt: iso(lastRun.finishedAt),
            counts: { ...lastRun.counts },
            error: lastRun.error,
          }
        : null,
    }
  }

  /** One match with the advisory context the detail view needs. */
  async function get({ organization }, matchId) {
    if (!isObjectIdString(matchId)) throw errors.notFound('Match not found.')
    const match = await VulnerabilityMatch.findOne({ _id: matchId, organizationId: organization._id }).lean()
    if (!match) throw errors.notFound('Match not found.')

    const base = serialize(match)
    const [advisory, component] = await Promise.all([
      Vulnerability.findById(match.vulnerabilityId, {
        summary: 1, description: 1, cveIds: 1, aliases: 1, publishedAt: 1, modifiedAt: 1, weaknesses: 1, affectedPackages: 1, references: 1, cvss: 1,
      }).lean(),
      SoftwareComponent.findOne({ _id: match.componentId, organizationId: organization._id }, { relationship: 1, scope: 1, purl: 1 }).lean(),
    ])

    // Only the affected entries for *this* package: the rest of the advisory is on its own page.
    const affected = (advisory?.affectedPackages ?? []).filter((entry) => entry.componentKey === match.componentKey)
    return {
      ...base,
      component: { ...base.component, purl: component?.purl ?? null, relationship: component?.relationship ?? null, scope: component?.scope ?? null },
      advisory: advisory
        ? {
            cveIds: advisory.cveIds,
            description: advisory.description,
            publishedAt: iso(advisory.publishedAt),
            modifiedAt: iso(advisory.modifiedAt),
            weaknesses: advisory.weaknesses,
            affected: affected.map((entry) => ({ name: entry.name, ranges: entry.ranges, versions: entry.versions.slice(0, 50), versionsTruncated: entry.versionsTruncated || entry.versions.length > 50 })),
          }
        : null,
    }
  }

  /**
   * Recomputes this organization's matches. Rate-limited per organization and
   * serialized by a database lock, because a run reads the whole inventory.
   */
  async function recalculate({ organization }, auth, ctx) {
    await rateLimits.enforce(`matching-run:org:${organization._id}`, RATE_LIMITS.matchingRunOrganization, 'client')
    let run
    try {
      run = await runner.run(organization, { trigger: 'api', actorUserId: auth?.user?._id ?? null, ctx })
    } catch (error) {
      if (error instanceof MatchingBusyError) throw errors.matchingInProgress()
      throw error
    }
    if (run.status === 'failed') throw errors.matchingFailed()
    return { run: { id: run.id, status: run.status, counts: run.counts, startedAt: iso(run.startedAt), finishedAt: iso(run.finishedAt) } }
  }

  return { list, summary, get, recalculate }
}
