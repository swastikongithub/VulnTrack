import { z } from 'zod'
import { CVE_ID, VULNERABILITY_LIMITS as L } from '../../../config/vulnerabilities.js'
import { scoreCvss } from '../../../utils/cvss.js'
import { cleanLine, cleanText, cleanUrl, finalizeAdvisory, firstSentence, parseSourceDate, unique } from '../advisory.js'

/**
 * NVD source adapter (CVE API 2.0, https://nvd.nist.gov/developers/vulnerabilities).
 *
 * Fetch:     by CVE ID, or by last-modified window (≤120 days per request, paged).
 * Validate:  each `cve` object against the provider shape below (lenient on
 *            fields we don't use, strict on the ones we do).
 * Normalize: into the shared advisory draft (advisory.js), then finalized.
 *
 * Nothing outside this file knows NVD's response format.
 */

export const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const PAGE_SIZE = 2_000
const MAX_WINDOW_MS = 120 * 24 * 60 * 60 * 1000
/** NVD asks for ≥6 s between requests without a key (5 per rolling 30 s); 50 per 30 s with one. */
export const NVD_INTERVAL_MS = { withoutKey: 6_500, withKey: 700 }

// ── Provider shape (the Validate step) ──────────────────────────────────────

const langText = z.object({ lang: z.string(), value: z.string() })
const cvssMetric = z.object({
  source: z.string().optional(),
  type: z.string().optional(),
  cvssData: z.object({ version: z.string(), vectorString: z.string(), baseScore: z.number().optional() }).loose(),
})
const cpeMatch = z
  .object({
    vulnerable: z.boolean(),
    criteria: z.string(),
    versionStartIncluding: z.string().optional(),
    versionStartExcluding: z.string().optional(),
    versionEndIncluding: z.string().optional(),
    versionEndExcluding: z.string().optional(),
  })
  .loose()

export const nvdCveSchema = z
  .object({
    id: z.string().regex(CVE_ID),
    published: z.string(),
    lastModified: z.string(),
    vulnStatus: z.string().optional(),
    descriptions: z.array(langText).default([]),
    metrics: z
      .object({
        cvssMetricV40: z.array(cvssMetric).optional(),
        cvssMetricV31: z.array(cvssMetric).optional(),
        cvssMetricV30: z.array(cvssMetric).optional(),
        cvssMetricV2: z.array(cvssMetric).optional(),
      })
      .loose()
      .default({}),
    weaknesses: z.array(z.object({ description: z.array(langText).default([]) }).loose()).default([]),
    configurations: z.array(z.object({ nodes: z.array(z.object({ cpeMatch: z.array(cpeMatch).default([]) }).loose()).default([]) }).loose()).default([]),
    references: z.array(z.object({ url: z.string(), tags: z.array(z.string()).optional() }).loose()).default([]),
    cisaExploitAdd: z.string().optional(),
    cisaActionDue: z.string().optional(),
    cisaRequiredAction: z.string().optional(),
    cisaVulnerabilityName: z.string().optional(),
  })
  .loose()

// ── Normalize ───────────────────────────────────────────────────────────────

const TAG_TYPES = [
  ['Exploit', 'exploit'],
  ['Patch', 'fix'],
  ['Vendor Advisory', 'advisory'],
  ['Third Party Advisory', 'advisory'],
  ['US Government Resource', 'advisory'],
  ['Mitigation', 'advisory'],
  ['VDB Entry', 'advisory'],
  ['Issue Tracking', 'report'],
  ['Mailing List', 'article'],
  ['Release Notes', 'article'],
  ['Technical Description', 'article'],
  ['Press/Media Coverage', 'article'],
  ['Product', 'package'],
]
const referenceType = (tags = []) => TAG_TYPES.find(([tag]) => tags.includes(tag))?.[1] ?? 'web'

const METRIC_KEYS = ['cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']

/** Splits a CPE 2.3 formatted string on unescaped colons. */
function cpeParts(cpe) {
  const parts = []
  let current = ''
  for (let i = 0; i < cpe.length; i++) {
    if (cpe[i] === '\\' && i + 1 < cpe.length) {
      current += cpe[i] + cpe[i + 1]
      i++
    } else if (cpe[i] === ':') {
      parts.push(current)
      current = ''
    } else current += cpe[i]
  }
  parts.push(current)
  return parts
}

const unescapeCpe = (value) => value.replace(/\\(.)/g, '$1')
const optional = (value) => (typeof value === 'string' && value ? cleanLine(value, L.versionMax) || null : null)

function affectedProducts(configurations) {
  const seen = new Set()
  const products = []
  let truncated = false
  for (const configuration of configurations) {
    for (const node of configuration.nodes) {
      for (const match of node.cpeMatch) {
        if (!match.vulnerable || match.criteria.length > L.cpeMax) continue
        const parts = cpeParts(match.criteria)
        if (parts.length !== 13 || parts[0] !== 'cpe' || parts[1] !== '2.3' || !['a', 'o', 'h'].includes(parts[2])) continue
        const product = {
          cpe: match.criteria,
          part: parts[2],
          vendor: cleanLine(unescapeCpe(parts[3]), 120),
          product: cleanLine(unescapeCpe(parts[4]), 120),
          version: optional(unescapeCpe(parts[5])),
          versionStartIncluding: optional(match.versionStartIncluding),
          versionStartExcluding: optional(match.versionStartExcluding),
          versionEndIncluding: optional(match.versionEndIncluding),
          versionEndExcluding: optional(match.versionEndExcluding),
        }
        if (!product.vendor || !product.product) continue
        const key = JSON.stringify(product)
        if (seen.has(key)) continue
        seen.add(key)
        if (products.length >= L.affectedProductsMax) {
          truncated = true
          continue
        }
        products.push(product)
      }
    }
  }
  return { products, truncated }
}

/** Raw NVD `cve` object → finalized advisory result. */
export function normalizeNvdCve(raw) {
  const parsed = nvdCveSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, sourceId: String(raw?.id ?? 'unknown').slice(0, 80), message: `provider shape: ${issue.path.join('.')}: ${issue.message}`.slice(0, 300) }
  }
  const cve = parsed.data
  const description = cleanText(cve.descriptions.find((d) => d.lang === 'en')?.value ?? cve.descriptions[0]?.value ?? '', L.descriptionMax)

  const cvss = []
  for (const key of METRIC_KEYS) {
    for (const metric of cve.metrics[key] ?? []) {
      const scored = scoreCvss(metric.cvssData.vectorString, metric.cvssData.baseScore ?? null)
      if (!scored || cvss.length >= L.cvssMax) continue
      cvss.push({ ...scored, assessedBy: metric.source ? cleanLine(metric.source, 100) : null, primary: metric.type === 'Primary' })
    }
  }

  const references = []
  const seenUrls = new Set()
  for (const ref of cve.references) {
    const url = cleanUrl(ref.url)
    if (!url || seenUrls.has(url) || references.length >= L.referencesMax) continue
    seenUrls.add(url)
    const tags = (ref.tags ?? []).map((t) => cleanLine(t, 60)).filter(Boolean).slice(0, L.referenceTagsMax)
    references.push({ url, type: referenceType(ref.tags), ...(tags.length ? { tags } : {}) })
  }

  const { products, truncated } = affectedProducts(cve.configurations)
  const rejected = cve.vulnStatus === 'Rejected'

  return finalizeAdvisory({
    source: 'nvd',
    sourceId: cve.id,
    aliases: [],
    summary: firstSentence(description),
    description,
    publishedAt: parseSourceDate(cve.published),
    modifiedAt: parseSourceDate(cve.lastModified),
    withdrawnAt: null,
    status: rejected ? 'rejected' : 'active',
    sourceStatus: cve.vulnStatus ? cleanLine(cve.vulnStatus, L.sourceStatusMax) : null,
    cvss,
    weaknesses: unique(cve.weaknesses.flatMap((w) => w.description.map((d) => d.value)).filter((v) => /^CWE-\d{1,6}$/.test(v))).slice(0, L.weaknessesMax),
    references,
    affectedPackages: [],
    affectedProducts: products,
    affectedProductsTruncated: truncated,
    knownExploited: cve.cisaExploitAdd
      ? {
          addedAt: parseSourceDate(cve.cisaExploitAdd),
          dueAt: parseSourceDate(cve.cisaActionDue),
          name: cve.cisaVulnerabilityName ? cleanLine(cve.cisaVulnerabilityName, 300) : null,
          requiredAction: cve.cisaRequiredAction ? cleanText(cve.cisaRequiredAction, 1_000) : null,
        }
      : null,
  })
}

// ── Fetch ───────────────────────────────────────────────────────────────────

/** NVD wants "yyyy-MM-ddTHH:mm:ss.SSS+00:00"-style timestamps. */
const nvdTime = (date) => date.toISOString().replace('Z', '+00:00')

/** Pulls `cve` objects out of an API response or an NVD JSON 2.0 feed file. */
export function cvesOf(payload) {
  if (!payload || !Array.isArray(payload.vulnerabilities)) return null
  return payload.vulnerabilities.map((item) => item?.cve).filter(Boolean)
}

export function createNvdAdapter({ http }) {
  return {
    source: 'nvd',
    normalize: normalizeNvdCve,

    async *byIds(ids) {
      for (const id of ids) {
        const payload = await http.getJson(`${NVD_API}?${new URLSearchParams({ cveId: id })}`)
        const cves = payload ? cvesOf(payload) : []
        if (cves === null) throw new Error('NVD response had an unexpected shape')
        yield* cves
      }
    },

    /** Every CVE modified in (since, until], window by window, page by page. */
    async *incremental({ since, until }) {
      for (let start = since.getTime(); start < until.getTime(); start += MAX_WINDOW_MS) {
        const end = Math.min(start + MAX_WINDOW_MS, until.getTime())
        let startIndex = 0
        for (;;) {
          const query = new URLSearchParams({
            lastModStartDate: nvdTime(new Date(start)),
            lastModEndDate: nvdTime(new Date(end)),
            resultsPerPage: String(PAGE_SIZE),
            startIndex: String(startIndex),
          })
          const payload = await http.getJson(`${NVD_API}?${query}`)
          const cves = payload ? cvesOf(payload) : null
          if (cves === null) throw new Error('NVD response had an unexpected shape')
          yield* cves
          startIndex += cves.length
          const total = Number(payload.totalResults)
          if (!cves.length || !Number.isFinite(total) || startIndex >= total) break
        }
      }
    },

    *fromFile(payload) {
      const cves = cvesOf(payload)
      if (cves === null) throw new Error('Not an NVD CVE API response or JSON 2.0 feed (expected { vulnerabilities: [{ cve }] })')
      yield* cves
    },
  }
}
