import { createNvdAdapter, NVD_INTERVAL_MS } from './adapters/nvdAdapter.js'
import { createOsvAdapter } from './adapters/osvAdapter.js'
import { createHttpClient } from './httpClient.js'

export { createSyncRunner, SyncBusyError, SyncUsageError } from './syncRunner.js'

/**
 * Builds the source adapters, each with its own HTTP client:
 *   NVD  optional API key (sent only to NVD, as its `apiKey` header), spaced
 *        to NVD's published rate limit for keyed or anonymous use
 *   OSV  no key, no published limit; a small concurrency cap in the adapter
 * `fetch`/`sleep` are injectable for tests.
 */
export function createSourceAdapters({ nvdApiKey = null, fetch, sleep, retries, backoffMs } = {}) {
  const common = { ...(fetch ? { fetch } : {}), ...(sleep ? { sleep } : {}), ...(retries !== undefined ? { retries } : {}), ...(backoffMs !== undefined ? { backoffMs } : {}) }
  const nvdHttp = createHttpClient({
    ...common,
    headers: nvdApiKey ? { apiKey: nvdApiKey } : {},
    minIntervalMs: nvdApiKey ? NVD_INTERVAL_MS.withKey : NVD_INTERVAL_MS.withoutKey,
    maxBytes: 128 * 1024 * 1024,
  })
  const osvHttp = createHttpClient({ ...common, maxBytes: 32 * 1024 * 1024 })
  return { nvd: createNvdAdapter({ http: nvdHttp }), osv: createOsvAdapter({ http: osvHttp }) }
}
