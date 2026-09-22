#!/usr/bin/env node
/**
 * Vulnerability-intelligence ingestion (operator tool).
 *
 *   npm run vulns:sync -- --source nvd --since 2026-09-01
 *   npm run vulns:sync -- --source nvd                        (resume from the last cursor)
 *   npm run vulns:sync -- --source nvd --ids CVE-2021-44228,CVE-2021-45046
 *   npm run vulns:sync -- --source osv --ecosystem npm --since 2026-09-01
 *   npm run vulns:sync -- --source osv --package npm:lodash
 *   npm run vulns:sync -- --source osv --ids GHSA-35jh-r3h4-6jhm
 *   npm run vulns:sync -- --source osv --file ./advisories.json
 *
 * Exit codes: 0 succeeded or partial · 1 failed · 2 bad usage or another run in progress.
 * Full reference: docs/vulnerabilities/ingestion.md
 */
import { readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { loadIngestionConfig } from '../src/config/ingestion.js'
import { OSV_ECOSYSTEMS, ADVISORY_ID, CVE_ID } from '../src/config/vulnerabilities.js'
import '../src/models/index.js'
import { createAuditService } from '../src/services/auditService.js'
import { createSourceAdapters, createSyncRunner, SyncBusyError, SyncUsageError } from '../src/services/intelligence/index.js'
import { createLogger } from '../src/utils/logger.js'
import { normalizeComponent } from '../src/utils/softwareIdentity.js'

const FILE_MAX_BYTES = 256 * 1024 * 1024
/** Results go to stdout (they are the program's output); diagnostics go to stderr. */
const out = (line = '') => process.stdout.write(`${line}\n`)
const IDS_MAX = 500
const OUR_ECOSYSTEMS = Object.values(OSV_ECOSYSTEMS)

const USAGE = `Usage: npm run vulns:sync -- --source <nvd|osv> [one of: --since <date> | --ids <A,B> | --package <eco:name> | --file <path>] [--ecosystem <eco>]

  --source      nvd | osv
  --since       ISO date/time; start of an incremental window (defaults to the last successful run's cursor)
  --ecosystem   osv incremental only: ${OUR_ECOSYSTEMS.join(', ')}
  --ids         comma-separated advisory IDs (up to ${IDS_MAX})
  --package     osv only: <ecosystem>:<name>, e.g. npm:lodash, maven:org.apache.logging.log4j:log4j-core
  --file        import a saved NVD API/feed JSON or OSV JSON file (no network)`

function usage(message) {
  if (message) console.error(`Error: ${message}\n`)
  console.error(USAGE)
  process.exit(2)
}

/** Turns CLI flags into a validated sync request. */
async function requestFrom(values) {
  const source = values.source
  if (!['nvd', 'osv'].includes(source)) usage('--source must be nvd or osv')

  const chosen = ['ids', 'package', 'file'].filter((k) => values[k] !== undefined)
  if (chosen.length > 1) usage(`Use only one of --${chosen.join(', --')}`)
  const mode = chosen[0] ?? 'incremental'

  if (values.ecosystem !== undefined && !(mode === 'incremental' && source === 'osv')) usage('--ecosystem applies to osv incremental syncs only')
  if (values.since !== undefined && mode !== 'incremental') usage('--since applies to incremental syncs only')

  const request = { source, mode, trigger: 'cli' }

  if (mode === 'incremental') {
    if (values.since !== undefined) {
      const since = new Date(values.since)
      if (Number.isNaN(since.getTime())) usage('--since must be a date, e.g. 2026-09-01 or 2026-09-01T12:00:00Z')
      request.since = since
    }
    if (source === 'osv') {
      if (!OUR_ECOSYSTEMS.includes(values.ecosystem)) usage(`--ecosystem is required for osv incremental syncs: ${OUR_ECOSYSTEMS.join(', ')}`)
      request.ecosystem = values.ecosystem
    }
  }

  if (mode === 'ids') {
    const ids = [...new Set(values.ids.split(',').map((id) => id.trim()).filter(Boolean))]
    if (!ids.length || ids.length > IDS_MAX) usage(`--ids takes 1 to ${IDS_MAX} IDs`)
    const pattern = source === 'nvd' ? CVE_ID : ADVISORY_ID
    const bad = ids.find((id) => !pattern.test(source === 'nvd' ? id.toUpperCase() : id))
    if (bad) usage(`"${bad}" is not a valid ${source === 'nvd' ? 'CVE' : 'advisory'} ID`)
    request.ids = source === 'nvd' ? ids.map((id) => id.toUpperCase()) : ids
  }

  if (mode === 'package') {
    if (source !== 'osv') usage('--package is an osv mode')
    const i = values.package.indexOf(':')
    const ecosystem = values.package.slice(0, i)
    const name = values.package.slice(i + 1)
    if (i < 1 || !OUR_ECOSYSTEMS.includes(ecosystem)) usage(`--package must be <ecosystem>:<name> with ecosystem one of ${OUR_ECOSYSTEMS.join(', ')}`)
    // Same identity rules as the software inventory: rejects names that can't exist in the ecosystem.
    const identity = normalizeComponent({ ecosystem, name, vendor: '', version: null })
    if (identity.fields) usage(`"${name}": ${Object.values(identity.fields)[0]}`)
    request.package = { ecosystem, name: identity.name }
  }

  if (mode === 'file') {
    const path = resolve(values.file)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) usage(`${values.file} is not a readable file`)
    if (info.size > FILE_MAX_BYTES) usage(`${values.file} is larger than ${FILE_MAX_BYTES / 1024 / 1024} MB`)
    let payload
    try {
      payload = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      usage(`${values.file} is not valid JSON`)
    }
    request.file = { name: basename(path), payload }
  }

  return request
}

function printSummary(result) {
  const { counts } = result
  const window = result.window ? ` (${result.window.since.toISOString()} → ${result.window.until.toISOString()})` : ''
  out(`\n${result.source.toUpperCase()} ${result.mode} sync ${result.status}${window}`)
  out(`  fetched ${counts.fetched} · created ${counts.created} · updated ${counts.updated} · unchanged ${counts.unchanged} · invalid ${counts.invalid}`)
  for (const problem of result.problems.slice(0, 10)) out(`  ! ${problem.sourceId}: ${problem.message}`)
  if (result.problems.length > 10) out(`  … ${result.problems.length - 10} more (see run ${result.id})`)
  if (result.error) out(`  error: ${result.error}`)
  out(`  run ${result.id}`)
}

async function main() {
  let values
  try {
    ;({ values } = parseArgs({
      options: {
        source: { type: 'string' },
        since: { type: 'string' },
        ecosystem: { type: 'string' },
        ids: { type: 'string' },
        package: { type: 'string' },
        file: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    }))
  } catch (error) {
    usage(error.message)
  }
  if (values.help) {
    out(USAGE)
    return 0
  }

  const request = await requestFrom(values)
  const config = loadIngestionConfig()
  const logger = createLogger(config.log)
  // The audit service only needs the secret to fingerprint emails; sync events carry none.
  const audit = createAuditService({ config: { authSecret: null }, logger })

  await connectDatabase(config.mongoUri, logger)
  try {
    const runner = createSyncRunner({ adapters: createSourceAdapters({ nvdApiKey: config.nvdApiKey }), audit, logger })
    if (request.source === 'nvd' && !config.nvdApiKey && request.mode !== 'file') {
      logger.info('No NVD_API_KEY: requests are spaced 6.5 s apart (NVD public rate limit)')
    }
    const result = await runner.run(request)
    printSummary(result)
    return result.status === 'failed' ? 1 : 0
  } catch (error) {
    if (error instanceof SyncBusyError || error instanceof SyncUsageError) {
      console.error(`Error: ${error.message}`)
      return 2
    }
    throw error
  } finally {
    // Our own shutdown, not a lost connection: skip the shared 'MongoDB disconnected' warning.
    mongoose.connection.removeAllListeners('disconnected')
    await disconnectDatabase()
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.message)
    process.exit(1)
  },
)
