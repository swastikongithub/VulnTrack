import { VulnerabilitySyncRun } from '../../models/index.js'
import { AUDIT_ACTIONS } from '../auditService.js'
import { SourceRequestError } from './httpClient.js'
import { storeAdvisory } from './vulnerabilityStore.js'

/**
 * The ingestion worker (master plan §28, §37): runs one sync for one source.
 *
 *   Fetch     adapter iterator (by IDs, package, incremental window or file)
 *   Validate  provider shape, inside adapter.normalize
 *   Normalize adapter.normalize → finalized advisory (strict schema)
 *   Store     storeAdvisory (idempotent upsert)
 *
 * Invoked from the CLI today (scripts/sync-vulnerabilities.js). A scheduler or
 * queue can call `run()` later unchanged: the lock, cursor and job log live in
 * the database, not in the process.
 *
 * Failure model:
 *  - one bad record → counted as `invalid`, noted in `problems`, run continues
 *  - source/network failure → run `failed`, cursor NOT advanced; re-running is
 *    safe because every write is an idempotent upsert
 *  - crashed process → its `running` record goes stale and the next run for
 *    that source marks it failed before starting
 */

export class SyncBusyError extends Error {}
export class SyncUsageError extends Error {}

const MODES = { nvd: ['incremental', 'ids', 'file'], osv: ['incremental', 'ids', 'package', 'file'] }
const PROBLEMS_MAX = 50
const HEARTBEAT_EVERY = 100

export function createSyncRunner({ adapters, audit, logger, now = () => new Date(), staleAfterMs = 30 * 60 * 1000 }) {
  async function recoverStale(source) {
    const cutoff = new Date(now().getTime() - staleAfterMs)
    const { modifiedCount } = await VulnerabilitySyncRun.updateMany(
      { source, status: 'running', heartbeatAt: { $lt: cutoff } },
      { $set: { status: 'failed', finishedAt: now(), error: 'Abandoned: the run stopped reporting progress.' } },
    )
    if (modifiedCount) logger?.warn({ source, count: modifiedCount }, 'Marked abandoned vulnerability sync runs as failed')
  }

  /** Where the last successful incremental run for this source (and ecosystem) stopped. */
  async function lastCursor(source, ecosystem) {
    const previous = await VulnerabilitySyncRun.findOne(
      { source, mode: 'incremental', status: { $in: ['succeeded', 'partial'] }, 'cursor.ecosystem': ecosystem ?? null, 'cursor.modifiedUntil': { $ne: null } },
      { cursor: 1 },
    )
      .sort({ finishedAt: -1 })
      .lean()
    return previous?.cursor.modifiedUntil ?? null
  }

  function iteratorFor(adapter, request, window) {
    switch (request.mode) {
      case 'ids':
        return adapter.byIds(request.ids)
      case 'package':
        return adapter.byPackage(request.package)
      case 'incremental':
        return adapter.incremental({ ...window, ecosystem: request.ecosystem })
      case 'file':
        return adapter.fromFile(request.file.payload)
      default:
        throw new SyncUsageError(`Unknown mode ${request.mode}`)
    }
  }

  /**
   * @param request { source, mode, ids?, package?: { ecosystem, name }, ecosystem?, since?: Date, file?: { name, payload }, trigger? }
   * @returns a plain summary of the finished run
   */
  async function run(request) {
    const adapter = adapters[request.source]
    if (!adapter) throw new SyncUsageError(`Unknown source "${request.source}"`)
    if (!MODES[request.source].includes(request.mode)) throw new SyncUsageError(`${request.source} does not support mode "${request.mode}"`)
    if (request.mode === 'incremental' && request.source === 'osv' && !request.ecosystem) {
      throw new SyncUsageError('OSV incremental sync is per ecosystem: pass an ecosystem')
    }

    await recoverStale(request.source)

    let window = null
    if (request.mode === 'incremental') {
      const since = request.since ?? (await lastCursor(request.source, request.ecosystem))
      if (!since) throw new SyncUsageError('No previous sync to resume from: the first incremental sync needs a start date (--since)')
      const until = now()
      if (since >= until) throw new SyncUsageError('The start date must be in the past')
      window = { since, until }
    }

    const startedAt = now()
    let runDoc
    try {
      runDoc = await VulnerabilitySyncRun.create({
        source: request.source,
        mode: request.mode,
        trigger: request.trigger ?? 'cli',
        params: {
          since: window?.since ?? null,
          until: window?.until ?? null,
          ecosystem: request.ecosystem ?? request.package?.ecosystem ?? null,
          package: request.package ? `${request.package.ecosystem}:${request.package.name}`.slice(0, 260) : null,
          idCount: request.ids?.length ?? null,
          file: request.file?.name?.slice(0, 260) ?? null,
        },
        startedAt,
        heartbeatAt: startedAt,
      })
    } catch (error) {
      if (error?.code === 11000) throw new SyncBusyError(`A ${request.source} sync is already running`)
      throw error
    }

    const counts = { fetched: 0, created: 0, updated: 0, unchanged: 0, invalid: 0 }
    const problems = []
    const note = (sourceId, message) => problems.length < PROBLEMS_MAX && problems.push({ sourceId: String(sourceId).slice(0, 80), message: String(message).slice(0, 300) })
    const seen = new Set()
    let status = 'succeeded'
    let errorMessage = null

    try {
      for await (const raw of iteratorFor(adapter, request, window)) {
        counts.fetched++
        const result = adapter.normalize(raw)
        if (!result.ok) {
          counts.invalid++
          note(result.sourceId, result.message)
        } else {
          seen.add(result.advisory.sourceId.toUpperCase())
          for (const alias of result.advisory.idKeys) seen.add(alias)
          counts[await storeAdvisory(result.advisory, { runId: runDoc._id, now: now() })]++
        }
        if (counts.fetched % HEARTBEAT_EVERY === 0) {
          await VulnerabilitySyncRun.updateOne({ _id: runDoc._id }, { $set: { heartbeatAt: now(), counts } })
        }
      }
      if (request.mode === 'ids') {
        for (const id of request.ids) if (!seen.has(id.toUpperCase())) note(id, 'Not found at the source')
      }
      if (counts.invalid || problems.length) status = 'partial'
    } catch (error) {
      status = 'failed'
      errorMessage = error instanceof SourceRequestError || error instanceof SyncUsageError ? error.message : `Unexpected error: ${error?.message ?? error}`
      logger?.error({ err: error, source: request.source, runId: String(runDoc._id) }, 'Vulnerability sync failed')
    }

    const finishedAt = now()
    runDoc.set({
      status,
      counts,
      problems,
      error: errorMessage?.slice(0, 500) ?? null,
      finishedAt,
      heartbeatAt: finishedAt,
      // Only a completed incremental run moves the cursor.
      ...(status !== 'failed' && window ? { cursor: { modifiedUntil: window.until, ecosystem: request.ecosystem ?? null } } : {}),
    })
    await runDoc.save()

    await audit?.record(
      {},
      {
        action: AUDIT_ACTIONS.VULNERABILITY_SYNC,
        outcome: status === 'failed' ? 'failure' : 'success',
        reason: status,
        resourceType: 'vulnerability_sync_run',
        resourceId: runDoc._id,
        metadata: { count: counts.created + counts.updated },
      },
    )

    return {
      id: String(runDoc._id),
      source: runDoc.source,
      mode: runDoc.mode,
      status,
      counts: { ...counts },
      problems,
      error: runDoc.error,
      window,
      startedAt,
      finishedAt,
    }
  }

  return { run }
}
