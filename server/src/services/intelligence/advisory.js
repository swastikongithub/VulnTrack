import { z } from 'zod'
import {
  ADVISORY_ID,
  CVE_ID,
  CVSS_VERSIONS,
  REFERENCE_TYPES,
  SEVERITIES,
  VULNERABILITY_LIMITS as L,
  VULNERABILITY_SOURCES,
  VULNERABILITY_STATUSES,
  severityRank,
  values,
} from '../../config/vulnerabilities.js'
import { SOFTWARE_ECOSYSTEMS, values as softwareValues } from '../../config/software.js'
import { headlineCvss } from '../../utils/cvss.js'

/**
 * The normalized advisory: the one shape every source adapter must produce
 * (master plan §28 "Validate → Normalize"). Adapters turn provider JSON into a
 * draft; `finalizeAdvisory` derives the shared fields (ID keys, CVE IDs,
 * headline severity) and validates the result against a strict schema. Only a
 * value that passes reaches the database, so a provider format change or a
 * hostile payload fails here as an `invalid` record instead of corrupting the
 * catalogue.
 */

// ── Cleaning helpers shared by adapters ─────────────────────────────────────

/** Removes control characters (keeps newlines and tabs), normalizes newlines, trims, caps length. */
export function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  let text = ''
  for (const char of value.replace(/\r\n?/g, '\n')) {
    const code = char.charCodeAt(0)
    if ((code < 32 && code !== 10 && code !== 9) || code === 127) continue
    text += char
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** A single line of text (labels, names). */
export const cleanLine = (value, max) => cleanText(value, max * 2).replace(/\s+/g, ' ').slice(0, max).trim()

/**
 * An http(s) URL safe to render as a link, or null. Rejects other schemes
 * (javascript:, data:, file:…), embedded credentials and oversized values.
 */
export function cleanUrl(value) {
  if (typeof value !== 'string' || value.length > L.urlMax) return null
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || !url.hostname) return null
  return url.href
}

/**
 * Parses a source timestamp. NVD omits the zone ("2021-12-10T10:15:09.143")
 * and means UTC; OSV uses RFC 3339 with nanoseconds.
 */
export function parseSourceDate(value) {
  if (typeof value !== 'string' || !value) return null
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`
  const date = new Date(withZone.replace(/(\.\d{3})\d+/, '$1'))
  return Number.isNaN(date.getTime()) ? null : date
}

/** First sentence of a description, for records whose source has no summary. */
export function firstSentence(text, max = L.summaryMax) {
  const line = text.split('\n').find((l) => l.trim()) ?? ''
  const match = /^(.{20,}?[.!?])(\s|$)/.exec(line)
  return cleanLine(match ? match[1] : line, max)
}

export const unique = (items) => [...new Set(items)]

// ── Strict normalized schema ─────────────────────────────────────────────────

const text = (max) => z.string().max(max)
const id = z.string().regex(ADVISORY_ID).max(L.sourceIdMax)
const date = z.date().nullable()

const advisorySchema = z.strictObject({
  source: z.enum(values(VULNERABILITY_SOURCES)),
  sourceId: id,
  aliases: z.array(id).max(L.aliasesMax),
  idKeys: z.array(z.string().max(L.sourceIdMax)).max(L.aliasesMax + 1),
  cveIds: z.array(z.string().regex(CVE_ID)).max(L.aliasesMax + 1),
  summary: text(L.summaryMax),
  description: text(L.descriptionMax),
  publishedAt: date,
  modifiedAt: date,
  withdrawnAt: date,
  status: z.enum(values(VULNERABILITY_STATUSES)),
  sourceStatus: text(L.sourceStatusMax).nullable(),
  cvss: z
    .array(
      z.strictObject({
        version: z.enum(CVSS_VERSIONS),
        vector: text(L.vectorMax),
        baseScore: z.number().min(0).max(10).nullable(),
        severity: z.enum(values(SEVERITIES)),
        assessedBy: text(100).nullable(),
        primary: z.boolean(),
      }),
    )
    .max(L.cvssMax),
  severity: z.enum(values(SEVERITIES)),
  severityRank: z.number().int().min(0).max(5),
  cvssScore: z.number().min(0).max(10).nullable(),
  weaknesses: z.array(z.string().regex(/^CWE-\d{1,6}$/)).max(L.weaknessesMax),
  references: z
    .array(
      z.strictObject({
        url: z.string().max(L.urlMax).refine((u) => cleanUrl(u) === u, 'unsafe URL'),
        type: z.enum(values(REFERENCE_TYPES)),
        tags: z.array(text(60)).max(L.referenceTagsMax).optional(),
      }),
    )
    .max(L.referencesMax),
  affectedPackages: z
    .array(
      z.strictObject({
        ecosystem: z.enum(softwareValues(SOFTWARE_ECOSYSTEMS)).nullable(),
        sourceEcosystem: z.string().min(1).max(80),
        name: z.string().min(1).max(L.packageNameMax),
        componentKey: text(340).nullable(),
        purl: z.string().startsWith('pkg:').max(512).nullable(),
        ranges: z
          .array(
            z.strictObject({
              type: z.enum(['SEMVER', 'ECOSYSTEM', 'GIT']),
              events: z
                .array(z.strictObject({ kind: z.enum(['introduced', 'fixed', 'lastAffected', 'limit']), version: z.string().min(1).max(L.versionMax) }))
                .max(L.eventsMax),
            }),
          )
          .max(L.rangesMax),
        versions: z.array(z.string().min(1).max(L.versionMax)).max(L.versionsMax),
        versionsTruncated: z.boolean(),
      }),
    )
    .max(L.affectedPackagesMax),
  affectedProducts: z
    .array(
      z.strictObject({
        cpe: z.string().startsWith('cpe:2.3:').max(L.cpeMax),
        part: z.enum(['a', 'o', 'h']),
        vendor: z.string().min(1).max(120),
        product: z.string().min(1).max(120),
        version: text(L.versionMax).nullable(),
        versionStartIncluding: text(L.versionMax).nullable(),
        versionStartExcluding: text(L.versionMax).nullable(),
        versionEndIncluding: text(L.versionMax).nullable(),
        versionEndExcluding: text(L.versionMax).nullable(),
      }),
    )
    .max(L.affectedProductsMax),
  affectedProductsTruncated: z.boolean(),
  knownExploited: z
    .strictObject({ addedAt: date, dueAt: date, name: text(300).nullable(), requiredAction: text(1_000).nullable() })
    .nullable(),
})

/** Maps a source's qualitative label ("MODERATE", "High") to ours; unknown when it isn't one. */
export function severityFromLabel(label) {
  const value = String(label ?? '').trim().toLowerCase()
  if (value === 'moderate') return 'medium'
  return ['critical', 'high', 'medium', 'low', 'none'].includes(value) ? value : 'unknown'
}

/**
 * Completes an adapter draft and validates it.
 * @param draft adapter output (everything except the derived fields)
 * @param fallbackSeverity a qualitative label from the source, used only when no CVSS entry has a score
 * @returns {{ ok: true, advisory } | { ok: false, sourceId, message }}
 */
export function finalizeAdvisory(draft, { fallbackSeverity = 'unknown' } = {}) {
  const aliases = unique(draft.aliases.filter((a) => a !== draft.sourceId)).slice(0, L.aliasesMax)
  const allIds = [draft.sourceId, ...aliases]
  const headline = headlineCvss(draft.cvss)
  const severity = headline ? headline.severity : fallbackSeverity

  const candidate = {
    ...draft,
    aliases,
    idKeys: unique(allIds.map((i) => i.toUpperCase())),
    cveIds: unique(allIds.map((i) => i.toUpperCase()).filter((i) => CVE_ID.test(i))),
    severity,
    severityRank: severityRank(severity),
    cvssScore: headline ? headline.baseScore : null,
  }
  const parsed = advisorySchema.safeParse(candidate)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, sourceId: String(draft.sourceId ?? '').slice(0, 80), message: `${issue.path.join('.') || 'record'}: ${issue.message}`.slice(0, 300) }
  }
  return { ok: true, advisory: parsed.data }
}
