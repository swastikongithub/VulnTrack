import { z } from 'zod'
import {
  SOFTWARE_ECOSYSTEMS,
  SOFTWARE_LIMITS,
  SOFTWARE_RELATIONSHIPS,
  SOFTWARE_SCOPES,
  SOFTWARE_SORTS,
  values,
} from '../config/software.js'

/**
 * Software component request schemas. Shape and bounds only: per-ecosystem
 * name and version rules, duplicates and the parent asset's state are checked
 * in services/softwareService.js (utils/softwareIdentity.js).
 *
 * Unknown keys are stripped: `organizationId`, `assetId` (comes from the URL),
 * `componentKey`, `purl`, `versionNormalized`, `source`… can't be set.
 */

const L = SOFTWARE_LIMITS
const choice = (entries, message) => z.enum(values(entries), { error: message })

const fields = {
  ecosystem: choice(SOFTWARE_ECOSYSTEMS, 'Choose an ecosystem'),
  name: z
    .string({ error: 'Enter the package name' })
    .trim()
    .min(1, 'Enter the package name')
    .max(L.nameMax, `Use ${L.nameMax} characters or fewer`),
  vendor: z
    .string({ error: 'Vendor must be text' })
    .trim()
    .max(L.vendorMax, `Use ${L.vendorMax} characters or fewer`),
  /** Empty or null means "version unknown". */
  version: z
    .string({ error: 'Version must be text' })
    .trim()
    .max(L.versionMax, `Use ${L.versionMax} characters or fewer`)
    .nullable(),
  relationship: choice(SOFTWARE_RELATIONSHIPS, 'Choose how it is used'),
  scope: choice(SOFTWARE_SCOPES, 'Choose a scope'),
}

export const createComponentSchema = z.object({
  ...fields,
  vendor: fields.vendor.default(''),
  version: fields.version.default(null),
  relationship: fields.relationship.default('unknown'),
  scope: fields.scope.default('unknown'),
})

export const updateComponentSchema = z
  .object({
    ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])),
    /** The revision the client last read (optimistic concurrency). */
    revision: z.number({ error: 'Reload the component and try again' }).int().min(1),
  })
  .refine((body) => Object.keys(body).some((key) => key !== 'revision'), { message: 'Change at least one field', path: ['form'] })

// ── Listing query ────────────────────────────────────────────────────────────

const list = (entries, message) =>
  z
    .string({ error: message })
    .max(200, message)
    .transform((raw) => [...new Set(raw.split(',').map((v) => v.trim()).filter(Boolean))])
    .pipe(z.array(z.enum(values(entries), { error: message })).max(values(entries).length))
    .optional()

export const listComponentsQuerySchema = z.object({
  q: z
    .string({ error: 'Search must be text' })
    .trim()
    .max(L.searchMax, `Search must be ${L.searchMax} characters or fewer`)
    .optional(),
  assetId: z.string({ error: 'Unknown asset' }).regex(/^[a-f0-9]{24}$/i, 'Unknown asset').optional(),
  ecosystem: list(SOFTWARE_ECOSYSTEMS, 'Unknown ecosystem'),
  relationship: list(SOFTWARE_RELATIONSHIPS, 'Unknown relationship'),
  scope: list(SOFTWARE_SCOPES, 'Unknown scope'),
  version: z.enum(['known', 'unknown'], { error: 'version must be known or unknown' }).optional(),
  sort: z.enum(SOFTWARE_SORTS, { error: 'Unknown sort' }).default('name'),
  order: z.enum(['asc', 'desc'], { error: 'order must be asc or desc' }).optional(),
  page: z.coerce.number({ error: 'Invalid page' }).int('Invalid page').min(1, 'Invalid page').max(10_000, 'Invalid page').default(1),
  pageSize: z.coerce
    .number({ error: 'Invalid page size' })
    .int('Invalid page size')
    .min(1, 'Invalid page size')
    .max(L.pageSizeMax, `Page size must be ${L.pageSizeMax} or fewer`)
    .default(L.pageSizeDefault),
})
