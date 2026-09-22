import { z } from 'zod'

/**
 * Configuration for the vulnerability-ingestion worker
 * (scripts/sync-vulnerabilities.js). Separate from the API's config/env.js:
 * the worker needs the database and, optionally, an NVD API key, but none of
 * the web settings (origins, cookies, auth secret), and the API never needs
 * the NVD key.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  /**
   * Optional. Raises NVD's rate limit from 5 to 50 requests per 30 s.
   * Request one at https://nvd.nist.gov/developers/request-an-api-key. Secret.
   */
  NVD_API_KEY: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(z.string().regex(/^[A-Za-z0-9-]{16,64}$/, 'NVD_API_KEY does not look like an NVD API key').optional())
    .optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: z
    .enum(['true', 'false', '1', '0'])
    .transform((value) => value === 'true' || value === '1')
    .optional(),
})

export function loadIngestionConfig(source = process.env) {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid ingestion configuration:\n${details}`)
  }
  const env = parsed.data
  return Object.freeze({
    env: env.NODE_ENV,
    mongoUri: env.MONGODB_URI,
    nvdApiKey: env.NVD_API_KEY ?? null,
    log: Object.freeze({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY ?? false }),
  })
}
