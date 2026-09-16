import pino from 'pino'

/**
 * Structured logger. Credentials, cookies and tokens are redacted at the
 * logger level so an accidental `log.info({ body })` cannot leak them.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.confirmPassword',
  '*.token',
  '*.passwordHash',
  '*.tokenHash',
]

export function createLogger({ level, pretty }) {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
      : {}),
  })
}
