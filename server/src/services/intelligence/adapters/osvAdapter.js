import { z } from 'zod'
import { ADVISORY_ID, OSV_ECOSYSTEMS, VULNERABILITY_LIMITS as L } from '../../../config/vulnerabilities.js'
import { scoreCvss } from '../../../utils/cvss.js'
import { normalizeComponent } from '../../../utils/softwareIdentity.js'
import { cleanLine, cleanText, cleanUrl, finalizeAdvisory, firstSentence, parseSourceDate, severityFromLabel, unique } from '../advisory.js'

/**
 * OSV source adapter (https://google.github.io/osv.dev/, schema 1.x).
 *
 * Fetch:     by advisory ID; by package (paged query); or incrementally per
 *            ecosystem from the published `modified_id.csv` index (newest
 *            first, so the read stops at the cursor).
 * Validate:  each record against the provider shape below.
 * Normalize: into the shared advisory draft. Package names are run through
 *            the software inventory's own identity rules, so an advisory's
 *            `componentKey` equals the inventory's for the same package.
 *
 * Nothing outside this file knows OSV's response format.
 */

export const OSV_API = 'https://api.osv.dev/v1'
export const OSV_BUCKET = 'https://osv-vulnerabilities.storage.googleapis.com'

/** Our ecosystem value → OSV's name (for the bucket path and package queries). */
export const OSV_NAME_FOR = Object.fromEntries(Object.entries(OSV_ECOSYSTEMS).map(([osv, ours]) => [ours, osv]))

// ── Provider shape (the Validate step) ──────────────────────────────────────

const event = z.object({ introduced: z.string().optional(), fixed: z.string().optional(), last_affected: z.string().optional(), limit: z.string().optional() }).loose()

export const osvRecordSchema = z
  .object({
    id: z.string().regex(ADVISORY_ID),
    modified: z.string(),
    published: z.string().optional(),
    withdrawn: z.string().optional(),
    aliases: z.array(z.string()).default([]),
    summary: z.string().optional(),
    details: z.string().optional(),
    severity: z.array(z.object({ type: z.string(), score: z.string() }).loose()).default([]),
    affected: z
      .array(
        z
          .object({
            package: z.object({ ecosystem: z.string(), name: z.string(), purl: z.string().optional() }).loose().optional(),
            ranges: z.array(z.object({ type: z.string(), events: z.array(event).default([]) }).loose()).default([]),
            versions: z.array(z.string()).default([]),
            severity: z.array(z.object({ type: z.string(), score: z.string() }).loose()).optional(),
          })
          .loose(),
      )
      .default([]),
    references: z.array(z.object({ type: z.string().optional(), url: z.string() }).loose()).default([]),
    database_specific: z.object({ cwe_ids: z.array(z.string()).optional(), severity: z.string().optional() }).loose().optional(),
  })
  .loose()

// ── Normalize ───────────────────────────────────────────────────────────────

const REFERENCE_TYPES = {
  ADVISORY: 'advisory',
  FIX: 'fix',
  REPORT: 'report',
  EVIDENCE: 'report',
  DISCUSSION: 'article',
  ARTICLE: 'article',
  PACKAGE: 'package',
}

const CVSS_TYPES = new Set(['CVSS_V2', 'CVSS_V3', 'CVSS_V4'])
const EVENT_KINDS = { introduced: 'introduced', fixed: 'fixed', last_affected: 'lastAffected', limit: 'limit' }

function affectedPackage(entry) {
  const pkg = entry.package
  if (!pkg) return null
  const sourceEcosystem = cleanLine(pkg.ecosystem, 80)
  const name = cleanLine(pkg.name, L.packageNameMax)
  if (!sourceEcosystem || !name) return null

  // "Debian:12" → "Debian"; only the base name maps to an inventory ecosystem.
  const ecosystem = OSV_ECOSYSTEMS[sourceEcosystem.split(':')[0]] ?? null
  let componentKey = null
  let purl = typeof pkg.purl === 'string' && pkg.purl.startsWith('pkg:') && pkg.purl.length <= 512 ? pkg.purl : null
  if (ecosystem) {
    const identity = normalizeComponent({ ecosystem, name, vendor: '', version: null })
    if (!identity.fields) {
      componentKey = identity.componentKey
      purl ??= identity.purl
    }
  }

  const ranges = []
  for (const range of entry.ranges.slice(0, L.rangesMax)) {
    if (!['SEMVER', 'ECOSYSTEM', 'GIT'].includes(range.type)) continue
    const events = []
    for (const e of range.events.slice(0, L.eventsMax)) {
      const [key] = Object.keys(EVENT_KINDS).filter((k) => typeof e[k] === 'string')
      if (!key) continue
      const version = cleanLine(e[key], L.versionMax)
      if (version) events.push({ kind: EVENT_KINDS[key], version })
    }
    if (events.length) ranges.push({ type: range.type, events })
  }

  const versions = unique(entry.versions.map((v) => cleanLine(v, L.versionMax)).filter(Boolean))
  return {
    ecosystem,
    sourceEcosystem,
    name,
    componentKey,
    purl,
    ranges,
    versions: versions.slice(0, L.versionsMax),
    versionsTruncated: versions.length > L.versionsMax,
  }
}

/** Raw OSV record → finalized advisory result. */
export function normalizeOsvRecord(raw) {
  const parsed = osvRecordSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, sourceId: String(raw?.id ?? 'unknown').slice(0, 80), message: `provider shape: ${issue.path.join('.')}: ${issue.message}`.slice(0, 300) }
  }
  const record = parsed.data
  const description = cleanText(record.details ?? '', L.descriptionMax)

  const cvss = []
  const seenVectors = new Set()
  for (const entry of [...record.severity, ...record.affected.flatMap((a) => a.severity ?? [])]) {
    if (!CVSS_TYPES.has(entry.type) || seenVectors.has(entry.score)) continue
    const scored = scoreCvss(entry.score)
    if (!scored || cvss.length >= L.cvssMax) continue
    seenVectors.add(entry.score)
    cvss.push({ ...scored, assessedBy: 'OSV', primary: true })
  }

  const references = []
  const seenUrls = new Set()
  for (const ref of record.references) {
    const url = cleanUrl(ref.url)
    if (!url || seenUrls.has(url) || references.length >= L.referencesMax) continue
    seenUrls.add(url)
    references.push({ url, type: REFERENCE_TYPES[ref.type] ?? 'web' })
  }

  const affectedPackages = record.affected.map(affectedPackage).filter(Boolean).slice(0, L.affectedPackagesMax)
  const withdrawnAt = parseSourceDate(record.withdrawn)
  const summary = record.summary ? cleanLine(record.summary, L.summaryMax) : firstSentence(description)

  return finalizeAdvisory(
    {
      source: 'osv',
      sourceId: record.id,
      aliases: record.aliases.filter((a) => ADVISORY_ID.test(a)),
      summary,
      description,
      publishedAt: parseSourceDate(record.published),
      modifiedAt: parseSourceDate(record.modified),
      withdrawnAt,
      status: withdrawnAt ? 'withdrawn' : 'active',
      sourceStatus: null,
      cvss,
      weaknesses: unique((record.database_specific?.cwe_ids ?? []).filter((c) => /^CWE-\d{1,6}$/.test(c))).slice(0, L.weaknessesMax),
      references,
      affectedPackages,
      affectedProducts: [],
      affectedProductsTruncated: false,
      knownExploited: null,
    },
    { fallbackSeverity: severityFromLabel(record.database_specific?.severity) },
  )
}

// ── Fetch ───────────────────────────────────────────────────────────────────

/** A single record, an array of records, or a query response { vulns: [...] }. */
export function recordsOf(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.vulns)) return payload.vulns
  if (payload && typeof payload.id === 'string') return [payload]
  return null
}

/** Runs `worker` over `items` with at most `limit` in flight, yielding results in input order. */
async function* pooled(items, limit, worker) {
  for (let i = 0; i < items.length; i += limit) {
    const batch = await Promise.all(items.slice(i, i + limit).map(worker))
    for (const result of batch) if (result) yield result
  }
}

export function createOsvAdapter({ http, concurrency = 4 }) {
  const fetchRecord = (id) => http.getJson(`${OSV_API}/vulns/${encodeURIComponent(id)}`)

  return {
    source: 'osv',
    normalize: normalizeOsvRecord,

    async *byIds(ids) {
      yield* pooled(ids, concurrency, fetchRecord)
    },

    /** Every advisory for one package (our ecosystem value + name). */
    async *byPackage({ ecosystem, name }) {
      let pageToken
      do {
        const payload = await http.postJson(`${OSV_API}/query`, {
          package: { ecosystem: OSV_NAME_FOR[ecosystem], name },
          ...(pageToken ? { page_token: pageToken } : {}),
        })
        const records = recordsOf(payload ?? { vulns: [] }) ?? []
        yield* records
        pageToken = typeof payload?.next_page_token === 'string' && payload.next_page_token ? payload.next_page_token : undefined
      } while (pageToken)
    },

    /**
     * Advisories in one ecosystem modified in (since, until]. Reads the
     * ecosystem's modified_id.csv (newest first) and stops at `since`, then
     * fetches each record. Entries newer than `until` are left for the next run.
     */
    async *incremental({ since, until, ecosystem }) {
      const ids = []
      const osvName = OSV_NAME_FOR[ecosystem]
      await http.eachLine(`${OSV_BUCKET}/${encodeURIComponent(osvName)}/modified_id.csv`, (line) => {
        const comma = line.indexOf(',')
        const modified = parseSourceDate(line.slice(0, comma))
        const id = line.slice(comma + 1).trim()
        if (!modified || !ADVISORY_ID.test(id)) return true
        if (modified <= since) return false
        if (modified <= until) ids.push(id)
        return true
      })
      yield* pooled(unique(ids), concurrency, fetchRecord)
    },

    *fromFile(payload) {
      const records = recordsOf(payload)
      if (records === null) throw new Error('Not OSV data (expected a record, an array of records, or { vulns: [...] })')
      yield* records
    },
  }
}
