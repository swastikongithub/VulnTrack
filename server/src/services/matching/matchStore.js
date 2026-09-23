import { VulnerabilityMatch } from '../../models/index.js'

/**
 * Persists match outcomes. Idempotent: a run that finds the same things again
 * reports `unchanged` and only moves `lastEvaluatedAt`/`runId`, so re-running
 * is cheap and safe.
 *
 * `firstDetectedAt` survives updates: it is when this organization first saw
 * the match, which a later findings phase will care about.
 */

/** Fields whose change makes a stored match stale. */
const COMPARED = ['status', 'confidence', 'route', 'severity', 'severityRank', 'cvssScore', 'knownExploited', 'summary', 'version', 'versionNormalized', 'assetArchived', 'assetId', 'assetName', 'packageName', 'sourceId', 'source']

/** Key order differs between what the engine builds and what MongoDB returns, so compare sorted. */
const stable = (value) =>
  JSON.stringify(
    Object.keys(value ?? {})
      .filter((key) => value[key] !== undefined && key !== '_id')
      .sort()
      .map((key) => [key, value[key]]),
  )
const sameReason = (a, b) => stable(a) === stable(b)
const sameList = (a = [], b = []) => a.length === b.length && a.every((value, i) => value === b[i])

export async function storeMatch(match, { runId, now }) {
  const key = { organizationId: match.organizationId, componentId: match.componentId, vulnerabilityId: match.vulnerabilityId }
  const existing = await VulnerabilityMatch.findOne(key).lean()

  if (!existing) {
    try {
      await VulnerabilityMatch.create({ ...match, firstDetectedAt: now, lastEvaluatedAt: now, runId })
      return 'created'
    } catch (error) {
      if (error?.code !== 11000) throw error
      return storeMatch(match, { runId, now }) // another run inserted it first
    }
  }

  const unchanged =
    COMPARED.every((field) => String(existing[field] ?? '') === String(match[field] ?? '')) &&
    sameReason(existing.reason && { ...existing.reason }, match.reason) &&
    sameList(existing.fixedVersions, match.fixedVersions)

  if (unchanged) {
    await VulnerabilityMatch.updateOne(key, { $set: { lastEvaluatedAt: now, runId } })
    return 'unchanged'
  }
  await VulnerabilityMatch.updateOne(key, { $set: { ...match, lastEvaluatedAt: now, runId } }, { runValidators: true })
  return 'updated'
}

/** Removes matches this run did not re-confirm (component gone, advisory changed, no longer affected). */
export async function pruneMatches(organizationId, runId) {
  const { deletedCount } = await VulnerabilityMatch.deleteMany({ organizationId, runId: { $ne: runId } })
  return deletedCount
}
