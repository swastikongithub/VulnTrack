import { z } from 'zod'

/**
 * Environment configuration. Parsed and validated once at startup; the process
 * refuses to start with missing or unsafe settings (fail fast, never fall back
 * to insecure defaults in production).
 */

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional()

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    /** Browser origin of the web app. Used for email links and CSRF origin checks. */
    APP_ORIGIN: z.url(),
    /** Extra origins allowed to call the API with credentials (comma-separated). */
    ALLOWED_ORIGINS: optionalString,

    /** ≥32 chars. Keys HMAC fingerprints (rate-limit keys, audit subjects). */
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),

    /** Number of reverse-proxy hops in front of the API (Railway: 1). */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    COOKIE_SECURE: bool.optional(),
    COOKIE_SAMESITE: z.enum(['lax', 'strict']).default('lax'),

    SESSION_TTL_HOURS: z.coerce.number().positive().max(72).default(12),
    SESSION_REMEMBER_DAYS: z.coerce.number().positive().max(90).default(30),

    EMAIL_TRANSPORT: z.enum(['log', 'smtp', 'memory']).default('log'),
    EMAIL_FROM: z.string().default('VulnTrack <no-reply@vulntrack.local>'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_SECURE: bool.optional(),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_PRETTY: bool.optional(),
  })
  .superRefine((env, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })

    if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
      issue('SMTP_HOST', 'SMTP_HOST is required when EMAIL_TRANSPORT=smtp')
    }
    if (env.NODE_ENV === 'production') {
      if (env.COOKIE_SECURE === false) issue('COOKIE_SECURE', 'Cookies must be Secure in production')
      if (!env.APP_ORIGIN.startsWith('https://')) issue('APP_ORIGIN', 'APP_ORIGIN must use https in production')
      if (env.EMAIL_TRANSPORT !== 'smtp') {
        // The log transport prints one-time tokens; never allowed outside development.
        issue('EMAIL_TRANSPORT', 'EMAIL_TRANSPORT must be smtp in production')
      }
      if (/change[-_ ]?me|example|dev[-_]?secret/i.test(env.AUTH_SECRET)) {
        issue('AUTH_SECRET', 'AUTH_SECRET looks like a placeholder')
      }
    }
    if (env.EMAIL_TRANSPORT === 'memory' && env.NODE_ENV !== 'test') {
      issue('EMAIL_TRANSPORT', 'The memory transport is for tests only')
    }
  })

export function loadConfig(source = process.env) {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }
  const env = parsed.data
  const isProduction = env.NODE_ENV === 'production'
  const cookieSecure = env.COOKIE_SECURE ?? isProduction

  const appOrigin = new URL(env.APP_ORIGIN).origin
  const extraOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => new URL(o).origin)

  return Object.freeze({
    env: env.NODE_ENV,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    mongoUri: env.MONGODB_URI,
    appOrigin,
    allowedOrigins: Object.freeze([...new Set([appOrigin, ...extraOrigins])]),
    authSecret: env.AUTH_SECRET,
    trustProxy: env.TRUST_PROXY,
    cookie: Object.freeze({
      secure: cookieSecure,
      sameSite: env.COOKIE_SAMESITE,
      // The __Host- prefix pins the cookie to this exact host, path "/" and HTTPS.
      name: cookieSecure ? '__Host-vt_session' : 'vt_session',
    }),
    session: Object.freeze({
      ttlMs: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
      rememberMs: env.SESSION_REMEMBER_DAYS * 24 * 60 * 60 * 1000,
      idleMs: 2 * 60 * 60 * 1000,
      rememberIdleMs: 7 * 24 * 60 * 60 * 1000,
      touchIntervalMs: 5 * 60 * 1000,
    }),
    email: Object.freeze({
      transport: env.EMAIL_TRANSPORT,
      from: env.EMAIL_FROM,
      smtp: Object.freeze({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: env.SMTP_SECURE ?? false,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
      }),
    }),
    log: Object.freeze({ level: env.LOG_LEVEL, pretty: env.LOG_PRETTY ?? false }),
  })
}
