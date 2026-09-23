import { z } from 'zod'
import { MATCH_CONFIDENCE_ENTRIES, MATCH_LIMITS, MATCH_SORTS, MATCH_STATUS_ENTRIES, values } from '../config/matching.js'
import { SOFTWARE_ECOSYSTEMS, values as softwareValues } from '../config/software.js'
import { SEVERITIES, values as vulnerabilityValues } from '../config/vulnerabilities.js'

/**
 * Query schema for the match list. There are no body schemas: matches are
 * derived data, and the only write is `recalculate`, which takes no body.
 */

const L = MATCH_LIMITS
const list = (allowed, message) =>
  z
    .string({ error: message })
    .max(200, message)
    .transform((raw) => [...new Set(raw.split(',').map((v) => v.trim()).filter(Boolean))])
    .pipe(z.array(z.enum(allowed, { error: message })).max(allowed.length))
    .optional()

const objectId = (message) => z.string({ error: message }).regex(/^[a-f0-9]{24}$/i, message).optional()

export const listMatchesQuerySchema = z.object({
  q: z.string({ error: 'Search must be text' }).trim().max(L.searchMax, `Search must be ${L.searchMax} characters or fewer`).optional(),
  status: list(values(MATCH_STATUS_ENTRIES), 'Unknown status'),
  confidence: list(values(MATCH_CONFIDENCE_ENTRIES), 'Unknown confidence'),
  severity: list(vulnerabilityValues(SEVERITIES), 'Unknown severity'),
  ecosystem: list(softwareValues(SOFTWARE_ECOSYSTEMS), 'Unknown ecosystem'),
  exploited: z.enum(['true'], { error: 'exploited must be true' }).optional(),
  assetId: objectId('Unknown asset'),
  vulnerabilityId: objectId('Unknown vulnerability'),
  /** Matches on archived assets are hidden by default, like the software inventory. */
  archived: z.enum(['true', 'false'], { error: 'archived must be true or false' }).default('false'),
  sort: z.enum(MATCH_SORTS, { error: 'Unknown sort' }).default('severity'),
  page: z.coerce.number({ error: 'Invalid page' }).int('Invalid page').min(1, 'Invalid page').max(10_000, 'Invalid page').default(1),
  pageSize: z.coerce
    .number({ error: 'Invalid page size' })
    .int('Invalid page size')
    .min(1, 'Invalid page size')
    .max(L.pageSizeMax, `Page size must be ${L.pageSizeMax} or fewer`)
    .default(L.pageSizeDefault),
})
