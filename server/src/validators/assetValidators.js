import { z } from 'zod'
import {
  ASSET_CRITICALITIES,
  ASSET_ENVIRONMENTS,
  ASSET_EXPOSURES,
  ASSET_IDENTIFIER_KINDS,
  ASSET_INITIAL_STATUSES,
  ASSET_LIMITS,
  ASSET_SORTS,
  ASSET_STATUSES,
  ASSET_TYPES,
  values,
} from '../config/assets.js'
import { hasControlCharacters } from '../utils/text.js'

/**
 * Asset request schemas. Shape and bounds only; kind-specific identifier
 * validation, duplicate checks, membership of the contact and lifecycle
 * transitions are business rules in services/assetService.js.
 *
 * Unknown keys are stripped: `organizationId`, `discovery`, `archived`,
 * `createdBy`, `criticalityRank`… can't be set through the API.
 */

const L = ASSET_LIMITS
const TAG = /^[a-z0-9][a-z0-9._:/-]*$/

const noControl = (schema) => schema.refine((v) => !hasControlCharacters(v), 'Remove control characters')
const choice = (entries, message) => z.enum(values(entries), { error: message })

const name = noControl(
  z
    .string({ error: 'Name the asset' })
    .trim()
    .min(1, 'Name the asset')
    .min(2, 'Name must be at least 2 characters')
    .max(L.nameMax, `Name must be ${L.nameMax} characters or fewer`),
)

const description = z
  .string({ error: 'Description must be text' })
  .trim()
  .max(L.descriptionMax, `Description must be ${L.descriptionMax} characters or fewer`)

const identifier = z.object({
  kind: choice(ASSET_IDENTIFIER_KINDS, 'Choose an identifier type'),
  value: z
    .string({ error: 'Enter a value' })
    .trim()
    .min(1, 'Enter a value')
    .max(L.identifierValueMax, `Use ${L.identifierValueMax} characters or fewer`),
})

const tags = z
  .array(
    z
      .string({ error: 'Tags must be text' })
      .trim()
      .toLowerCase()
      .min(1, 'Tags can’t be empty')
      .max(L.tagMax, `Tags must be ${L.tagMax} characters or fewer`)
      .regex(TAG, 'Tags use letters, numbers and . _ : / -'),
    { error: 'Tags must be a list' },
  )
  .max(L.tagsMax, `Use ${L.tagsMax} tags or fewer`)
  .transform((list) => [...new Set(list)])

const technologies = z
  .array(
    noControl(
      z
        .string({ error: 'Technologies must be text' })
        .trim()
        .min(1, 'Technologies can’t be empty')
        .max(L.technologyMax, `Use ${L.technologyMax} characters or fewer`),
    ),
    { error: 'Technologies must be a list' },
  )
  .max(L.technologiesMax, `Use ${L.technologiesMax} technologies or fewer`)
  .transform((list) => {
    const seen = new Set()
    return list.filter((item) => {
      const key = item.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

const owner = z.object(
  {
    team: noControl(
      z.string({ error: 'Team must be text' }).trim().max(L.teamMax, `Team must be ${L.teamMax} characters or fewer`),
    ).optional(),
    contactUserId: z
      .string({ error: 'Choose a member' })
      .regex(/^[a-f0-9]{24}$/i, 'Choose a member')
      .nullable()
      .optional(),
  },
  { error: 'Owner must be an object' },
)

const fields = {
  name,
  description,
  type: choice(ASSET_TYPES, 'Choose an asset type'),
  environment: choice(ASSET_ENVIRONMENTS, 'Choose an environment'),
  criticality: choice(ASSET_CRITICALITIES, 'Choose a criticality'),
  exposure: choice(ASSET_EXPOSURES, 'Choose an exposure'),
  status: choice(ASSET_STATUSES, 'Choose a lifecycle status'),
  identifiers: z
    .array(identifier, { error: 'Identifiers must be a list' })
    .max(L.identifiersMax, `Use ${L.identifiersMax} identifiers or fewer`),
  tags,
  technologies,
  owner,
}

export const createAssetSchema = z.object({
  ...fields,
  description: fields.description.default(''),
  exposure: fields.exposure.default('unknown'),
  status: z.enum(ASSET_INITIAL_STATUSES, { error: 'New assets start as planned or active' }).default('active'),
  identifiers: fields.identifiers.default([]),
  tags: fields.tags.default([]),
  technologies: fields.technologies.default([]),
  owner: fields.owner.default({}),
})

export const updateAssetSchema = z
  .object({
    ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])),
    /** The revision the client last read (optimistic concurrency). */
    revision: z.number({ error: 'Reload the asset and try again' }).int().min(1),
  })
  .refine((body) => Object.keys(body).some((key) => key !== 'revision'), { message: 'Change at least one field', path: ['form'] })

/** Optional revision for archive / restore (applied when present). */
export const assetRevisionSchema = z.object({ revision: z.number().int().min(1).optional() })

// ── Listing query ────────────────────────────────────────────────────────────

/** `?type=api,server` → ['api','server']; repeated keys (arrays) are rejected. */
const list = (entries, message) =>
  z
    .string({ error: message })
    .max(300, message)
    .transform((raw) => [...new Set(raw.split(',').map((v) => v.trim()).filter(Boolean))])
    .pipe(z.array(z.enum(values(entries), { error: message })).max(values(entries).length))
    .optional()

export const listAssetsQuerySchema = z.object({
  q: z
    .string({ error: 'Search must be text' })
    .trim()
    .max(L.searchMax, `Search must be ${L.searchMax} characters or fewer`)
    .optional(),
  type: list(ASSET_TYPES, 'Unknown asset type'),
  environment: list(ASSET_ENVIRONMENTS, 'Unknown environment'),
  criticality: list(ASSET_CRITICALITIES, 'Unknown criticality'),
  exposure: list(ASSET_EXPOSURES, 'Unknown exposure'),
  status: list(ASSET_STATUSES, 'Unknown status'),
  tag: z.string({ error: 'Unknown tag' }).trim().toLowerCase().max(L.tagMax).regex(TAG, 'Unknown tag').optional(),
  archived: z.enum(['false', 'true'], { error: 'archived must be true or false' }).default('false'),
  sort: z.enum(ASSET_SORTS, { error: 'Unknown sort' }).default('name'),
  order: z.enum(['asc', 'desc'], { error: 'order must be asc or desc' }).optional(),
  page: z.coerce.number({ error: 'Invalid page' }).int('Invalid page').min(1, 'Invalid page').max(10_000, 'Invalid page').default(1),
  pageSize: z.coerce
    .number({ error: 'Invalid page size' })
    .int('Invalid page size')
    .min(1, 'Invalid page size')
    .max(L.pageSizeMax, `Page size must be ${L.pageSizeMax} or fewer`)
    .default(L.pageSizeDefault),
})
