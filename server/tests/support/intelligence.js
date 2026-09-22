import { readFileSync } from 'node:fs'
import { createAuditService } from '../../src/services/auditService.js'
import { createSourceAdapters, createSyncRunner } from '../../src/services/intelligence/index.js'

/** Recorded NVD/OSV payloads (trimmed real records; see fixtures/intelligence/README.md). */
export const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/intelligence/${name}`, import.meta.url), 'utf8'))

/**
 * A fake `fetch` that answers from `handler(url, init)` and records every call.
 * The handler returns a Response, a plain body (→ 200 JSON), or null (→ 404).
 */
export function fakeFetch(handler) {
  const calls = []
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined })
    const answer = await handler(url, init)
    if (answer instanceof Response) return answer
    if (answer === null) return new Response('{"message":"not found"}', { status: 404 })
    return new Response(typeof answer === 'string' ? answer : JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { fetch, calls }
}

const offline = fakeFetch(() => new Response('offline', { status: 500 })).fetch

/** A sync runner over fake network; no delays, no retries unless asked. */
export function testRunner({ fetch = offline, now, retries = 0, nvdApiKey = null, staleAfterMs } = {}) {
  const audit = createAuditService({ config: { authSecret: 'x'.repeat(32) }, logger: null })
  const adapters = createSourceAdapters({ fetch, sleep: async () => {}, retries, backoffMs: 1, nvdApiKey })
  return createSyncRunner({ adapters, audit, logger: null, ...(now ? { now } : {}), ...(staleAfterMs ? { staleAfterMs } : {}) })
}

/** Loads every fixture into the catalogue through the real pipeline (file mode). */
export async function seedCatalogue() {
  const runner = testRunner()
  const runs = [
    await runner.run({ source: 'nvd', mode: 'file', trigger: 'test', file: { name: 'nvd-cve-2021-44228.json', payload: fixture('nvd-cve-2021-44228.json') } }),
    await runner.run({ source: 'nvd', mode: 'file', trigger: 'test', file: { name: 'nvd-page.json', payload: fixture('nvd-page.json') } }),
    await runner.run({ source: 'osv', mode: 'file', trigger: 'test', file: { name: 'ghsa.json', payload: fixture('osv-GHSA-35jh-r3h4-6jhm.json') } }),
    await runner.run({ source: 'osv', mode: 'file', trigger: 'test', file: { name: 'query.json', payload: fixture('osv-query-lodash.json') } }),
    await runner.run({ source: 'osv', mode: 'file', trigger: 'test', file: { name: 'pysec.json', payload: fixture('osv-PYSEC-2021-19.json') } }),
  ]
  for (const run of runs) if (run.status !== 'succeeded') throw new Error(`seed run ${run.source} ${run.status}: ${JSON.stringify(run.problems)} ${run.error}`)
  return runs
}
