#!/usr/bin/env node
/**
 * Recomputes vulnerability matches (operator tool).
 *
 *   npm run matches:recompute -- --organization 6ab24d93509025161e54eedb
 *   npm run matches:recompute -- --all
 *
 * Members of an organization can do the same thing from the Matches page
 * (which needs findings:create); this exists for operators, for a host
 * scheduler, and for after a large ingestion run.
 *
 * Exit codes: 0 every run succeeded · 1 at least one run failed · 2 bad usage.
 * Full reference: docs/matching/matching.md
 */
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { loadIngestionConfig } from '../src/config/ingestion.js'
import { Organization } from '../src/models/index.js'
import '../src/models/index.js'
import { createAuditService } from '../src/services/auditService.js'
import { createMatchRunner, MatchingBusyError } from '../src/services/matching/matchRunner.js'
import { createLogger } from '../src/utils/logger.js'

const out = (line = '') => process.stdout.write(`${line}\n`)
const USAGE = `Usage: npm run matches:recompute -- (--organization <id> | --all)

  --organization  recompute one organization, by id
  --all           recompute every organization, one after another`

function usage(message) {
  if (message) console.error(`Error: ${message}\n`)
  console.error(USAGE)
  process.exit(2)
}

async function main() {
  let values
  try {
    ;({ values } = parseArgs({ options: { organization: { type: 'string' }, all: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } }, strict: true, allowPositionals: false }))
  } catch (error) {
    usage(error.message)
  }
  if (values.help) {
    out(USAGE)
    return 0
  }
  if (Boolean(values.all) === Boolean(values.organization)) usage('Pass exactly one of --organization <id> or --all')
  if (values.organization && !/^[a-f0-9]{24}$/i.test(values.organization)) usage('--organization must be an organization id')

  // The worker only needs the database and logging; it shares the ingestion worker's config.
  const config = loadIngestionConfig()
  const logger = createLogger(config.log)
  const audit = createAuditService({ config: { authSecret: null }, logger })

  await connectDatabase(config.mongoUri, logger)
  try {
    const organizations = values.all
      ? await Organization.find({}, { name: 1 }).sort({ createdAt: 1 }).lean()
      : await Organization.find({ _id: values.organization }, { name: 1 }).lean()
    if (!organizations.length) {
      console.error('No such organization.')
      return 2
    }

    const runner = createMatchRunner({ audit, logger })
    let failed = 0
    for (const organization of organizations) {
      try {
        const result = await runner.run(organization, { trigger: 'cli' })
        const c = result.counts
        out(`\n${organization.name} — matching ${result.status}`)
        out(`  components ${c.components} · candidates ${c.candidates} · matches ${c.affected} affected, ${c.unknownVersion} unknown version, ${c.undetermined} undetermined`)
        out(`  created ${c.created} · updated ${c.updated} · unchanged ${c.unchanged} · removed ${c.removed}`)
        if (result.error) out(`  error: ${result.error}`)
        if (result.status === 'failed') failed++
      } catch (error) {
        failed++
        console.error(`${organization.name}: ${error instanceof MatchingBusyError ? error.message : `Unexpected error: ${error.message}`}`)
      }
    }
    return failed ? 1 : 0
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
