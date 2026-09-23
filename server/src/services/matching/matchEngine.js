import { ecosystemOf } from '../../config/software.js'
import { MATCH_CONFIDENCES, MATCH_STATUSES } from '../../config/matching.js'
import { evaluateAffected, fixedVersionsOf } from './rangeEvaluator.js'

/**
 * Decides what one advisory says about one installed software component.
 *
 * Identity first, then versions:
 *   1. registry packages join on `componentKey` — the canonical
 *      `ecosystem:normalized-name` both sides already store, so naming
 *      differences (Express/express, Django_REST.framework/django-rest-framework)
 *      are resolved before matching, not during it;
 *   2. other software ("generic") joins on the CPE vendor/product an NVD
 *      record names, because there is no registry identity to key on;
 *   3. the installed version is then evaluated against the published ranges.
 *
 * Every outcome carries a status, a confidence and a structured reason, so the
 * UI can explain itself and a person can disagree with a specific step.
 *
 * Pure and deterministic: same inputs, same output. No database, no clock.
 */

const rank = { affected: 3, unknown_version: 2, undetermined: 1 }
/** Keeps the stronger of two outcomes; either may be absent. */
const better = (a, b) => {
  if (!b) return a ?? null
  if (!a) return b
  return rank[b.status] > rank[a.status] ? b : a
}

/** CPE writes spaces as underscores ("windows_server"). */
const cpeForms = (value) => {
  const text = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return new Set([text, text.replace(/ /g, '_')])
}
const overlaps = (a, b) => [...a].some((value) => b.has(value))

const hasBounds = (product) =>
  Boolean(product.versionStartIncluding || product.versionStartExcluding || product.versionEndIncluding || product.versionEndExcluding)

/** Registry packages: the advisory's affected entries for this component's package. */
function matchPackages(component, vulnerability, scheme) {
  let best = null
  for (const affected of vulnerability.affectedPackages ?? []) {
    if (!affected.componentKey || affected.componentKey !== component.componentKey) continue

    const identity = { via: 'package', package: affected.name, ecosystem: affected.ecosystem, fixedVersions: fixedVersionsOf(affected.ranges) }

    if (!component.versionNormalized) {
      best = better(best, {
        status: MATCH_STATUSES.UNKNOWN_VERSION,
        confidence: MATCH_CONFIDENCES.MEDIUM,
        reason: { rule: 'version_unknown' },
        ...identity,
      })
      continue
    }

    const result = evaluateAffected(scheme, component.versionNormalized, affected)
    if (result.status === 'not_affected') continue
    best = better(best, {
      status: result.status === 'affected' ? MATCH_STATUSES.AFFECTED : MATCH_STATUSES.UNDETERMINED,
      confidence: result.status === 'affected' ? MATCH_CONFIDENCES.HIGH : MATCH_CONFIDENCES.LOW,
      reason: result.reason,
      ...identity,
    })
  }
  return best
}

/**
 * Other software: match NVD's CPE vendor/product. Versions of `generic`
 * software have no defined order (config/software.js), so only equality is
 * decided here; a CPE version *range* is reported as undetermined rather than
 * guessed at.
 */
function matchProducts(component, vulnerability) {
  const productForms = cpeForms(component.name)
  const vendorForms = component.vendor ? cpeForms(component.vendor) : null
  let best = null

  for (const product of vulnerability.affectedProducts ?? []) {
    if (!overlaps(cpeForms(product.product), productForms)) continue
    if (vendorForms && !overlaps(cpeForms(product.vendor), vendorForms)) continue

    const identity = { via: 'cpe', package: `${product.vendor}/${product.product}`, ecosystem: null, fixedVersions: [] }
    // Without a vendor on our side, a product-name match alone is weaker.
    const base = vendorForms ? MATCH_CONFIDENCES.MEDIUM : MATCH_CONFIDENCES.LOW

    if (!component.versionNormalized) {
      best = better(best, { status: MATCH_STATUSES.UNKNOWN_VERSION, confidence: base, reason: { rule: 'version_unknown' }, ...identity })
      continue
    }
    const installed = component.versionNormalized.toLowerCase()
    const cpeVersion = product.version && product.version !== '*' && product.version !== '-' ? product.version.toLowerCase() : null

    if (cpeVersion) {
      if (cpeVersion === installed) {
        best = better(best, { status: MATCH_STATUSES.AFFECTED, confidence: base, reason: { rule: 'cpe_version', cpe: product.cpe, version: product.version }, ...identity })
      }
      continue // a different literal version is simply not this product version
    }
    if (hasBounds(product)) {
      best = better(best, {
        status: MATCH_STATUSES.UNDETERMINED,
        confidence: MATCH_CONFIDENCES.LOW,
        reason: {
          rule: 'cpe_unordered_range',
          cpe: product.cpe,
          ...(product.versionStartIncluding ? { startIncluding: product.versionStartIncluding } : {}),
          ...(product.versionStartExcluding ? { startExcluding: product.versionStartExcluding } : {}),
          ...(product.versionEndIncluding ? { endIncluding: product.versionEndIncluding } : {}),
          ...(product.versionEndExcluding ? { endExcluding: product.versionEndExcluding } : {}),
        },
        ...identity,
      })
      continue
    }
    // "cpe:2.3:a:vendor:product:*" with no bounds: every version of the product.
    best = better(best, { status: MATCH_STATUSES.AFFECTED, confidence: MATCH_CONFIDENCES.LOW, reason: { rule: 'cpe_any_version', cpe: product.cpe }, ...identity })
  }
  return best
}

/**
 * @param component  { ecosystem, componentKey, name, vendor, versionNormalized }
 * @param vulnerability { affectedPackages, affectedProducts }
 * @returns the strongest outcome, or null when this advisory says nothing about
 *          the component (a `not_affected` pair is not a match and is not stored).
 */
export function evaluateMatch(component, vulnerability) {
  const scheme = ecosystemOf(component.ecosystem)?.scheme
  if (!scheme) return null
  const fromPackages = matchPackages(component, vulnerability, scheme)
  const fromProducts = component.ecosystem === 'generic' ? matchProducts(component, vulnerability) : null
  return better(fromPackages, fromProducts)
}
