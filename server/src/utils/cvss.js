/**
 * CVSS vector parsing, validation and base scoring.
 *
 *   v3.0 / v3.1  base score computed from the vector (FIRST CVSS v3.1
 *                specification §7.1, including its Roundup definition)
 *   v2.0         base score computed from the vector (CVSS v2 guide §3.2.1)
 *   v4.0         vector validated; the score is NOT computed here. v4 scoring
 *                uses FIRST's macro-vector lookup tables, and an approximation
 *                would be worse than no number. A v4 score is kept only when
 *                the source supplies it.
 *
 * Only base metrics feed the score. Temporal/threat/environmental metrics are
 * accepted in a vector (so real-world vectors validate) but ignored.
 * This is technical severity only, never organizational risk (master plan §5.4).
 */

const V3_BASE = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR: { N: 1, L: 1, H: 1 }, // scope-dependent, resolved below
  UI: { N: 0.85, R: 0.62 },
  S: { U: 1, C: 1 },
  C: { H: 0.56, L: 0.22, N: 0 },
  I: { H: 0.56, L: 0.22, N: 0 },
  A: { H: 0.56, L: 0.22, N: 0 },
}
const V3_OPTIONAL = {
  E: 'XUPFH', RL: 'XOTWU', RC: 'XURC', CR: 'XLMH', IR: 'XLMH', AR: 'XLMH',
  MAV: 'XNALP', MAC: 'XLH', MPR: 'XNLH', MUI: 'XNR', MS: 'XUC', MC: 'XNLH', MI: 'XNLH', MA: 'XNLH',
}

const V2_BASE = {
  AV: { L: 0.395, A: 0.646, N: 1 },
  AC: { H: 0.35, M: 0.61, L: 0.71 },
  Au: { M: 0.45, S: 0.56, N: 0.704 },
  C: { N: 0, P: 0.275, C: 0.66 },
  I: { N: 0, P: 0.275, C: 0.66 },
  A: { N: 0, P: 0.275, C: 0.66 },
}
const V2_OPTIONAL = { E: ['U', 'POC', 'F', 'H', 'ND'], RL: ['OF', 'TF', 'W', 'U', 'ND'], RC: ['UC', 'UR', 'C', 'ND'], CDP: ['N', 'L', 'LM', 'MH', 'H', 'ND'], TD: ['N', 'L', 'M', 'H', 'ND'], CR: ['L', 'M', 'H', 'ND'], IR: ['L', 'M', 'H', 'ND'], AR: ['L', 'M', 'H', 'ND'] }

const V4_BASE = {
  AV: 'NALP', AC: 'LH', AT: 'NP', PR: 'NLH', UI: 'NPA', VC: 'HLN', VI: 'HLN', VA: 'HLN', SC: 'HLN', SI: 'HLN', SA: 'HLN',
}
const V4_OPTIONAL = {
  E: 'XAPU', CR: 'XHML', IR: 'XHML', AR: 'XHML',
  MAV: 'XNALP', MAC: 'XLH', MAT: 'XNP', MPR: 'XNLH', MUI: 'XNPA', MVC: 'XHLN', MVI: 'XHLN', MVA: 'XHLN', MSC: 'XHLN', MSI: 'XSHLN', MSA: 'XSHLN',
  S: 'XNP', AU: 'XNY', R: 'XAUI', V: 'XDC', RE: 'XLMH', U: ['X', 'Clear', 'Green', 'Amber', 'Red'],
}

/** Splits "K:V/K:V" into a map; null on malformed or repeated metrics. */
function metricsOf(parts) {
  const metrics = {}
  for (const part of parts) {
    const i = part.indexOf(':')
    if (i < 1 || i === part.length - 1) return null
    const key = part.slice(0, i)
    if (key in metrics) return null
    metrics[key] = part.slice(i + 1)
  }
  return metrics
}

function allowed(spec, value) {
  return Array.isArray(spec) ? spec.includes(value) : typeof spec === 'string' ? spec.includes(value) && value.length === 1 : value in spec
}

function checkMetrics(metrics, base, optional) {
  for (const key of Object.keys(base)) if (!(key in metrics) || !allowed(base[key], metrics[key])) return false
  for (const [key, value] of Object.entries(metrics)) {
    if (key in base) continue
    if (!(key in optional) || !allowed(optional[key], value)) return false
  }
  return true
}

/**
 * Parses a CVSS vector string.
 * @returns {{ version: '2.0'|'3.0'|'3.1'|'4.0', vector: string, metrics: object } | null}
 */
export function parseCvss(input) {
  if (typeof input !== 'string') return null
  const vector = input.trim().replace(/^\((.*)\)$/, '$1')
  if (!vector || vector.length > 200) return null

  const v3 = /^CVSS:(3\.[01])\/(.+)$/.exec(vector)
  if (v3) {
    const metrics = metricsOf(v3[2].split('/'))
    return metrics && checkMetrics(metrics, V3_BASE, V3_OPTIONAL) ? { version: v3[1], vector, metrics } : null
  }
  const v4 = /^CVSS:4\.0\/(.+)$/.exec(vector)
  if (v4) {
    const metrics = metricsOf(v4[1].split('/'))
    return metrics && checkMetrics(metrics, V4_BASE, V4_OPTIONAL) ? { version: '4.0', vector, metrics } : null
  }
  // v2 vectors carry no prefix (some sources add "CVSS:2.0/").
  const metrics = metricsOf(vector.replace(/^CVSS:2\.0\//, '').split('/'))
  return metrics && checkMetrics(metrics, V2_BASE, V2_OPTIONAL) ? { version: '2.0', vector: vector.replace(/^CVSS:2\.0\//, ''), metrics } : null
}

/** CVSS v3.1 Roundup: smallest value, to one decimal, ≥ input (float-safe). */
function roundUp31(value) {
  const int = Math.round(value * 100_000)
  return int % 10_000 === 0 ? int / 100_000 : (Math.floor(int / 10_000) + 1) / 10
}
/** CVSS v3.0 Roundup, as written in that specification. */
const roundUp30 = (value) => Math.ceil(value * 10 - 1e-9) / 10

function scoreV3({ version, metrics: m }) {
  const changed = m.S === 'C'
  const pr = { N: 0.85, L: changed ? 0.68 : 0.62, H: changed ? 0.5 : 0.27 }[m.PR]
  const iss = 1 - (1 - V3_BASE.C[m.C]) * (1 - V3_BASE.I[m.I]) * (1 - V3_BASE.A[m.A])
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss
  const exploitability = 8.22 * V3_BASE.AV[m.AV] * V3_BASE.AC[m.AC] * pr * V3_BASE.UI[m.UI]
  if (impact <= 0) return 0
  const roundUp = version === '3.1' ? roundUp31 : roundUp30
  return roundUp(Math.min(changed ? 1.08 * (impact + exploitability) : impact + exploitability, 10))
}

function scoreV2({ metrics: m }) {
  const impact = 10.41 * (1 - (1 - V2_BASE.C[m.C]) * (1 - V2_BASE.I[m.I]) * (1 - V2_BASE.A[m.A]))
  const exploitability = 20 * V2_BASE.AV[m.AV] * V2_BASE.AC[m.AC] * V2_BASE.Au[m.Au]
  const score = (0.6 * impact + 0.4 * exploitability - 1.5) * (impact === 0 ? 0 : 1.176)
  return Math.round(score * 10) / 10
}

/** Qualitative rating for a score under the given CVSS version. */
export function cvssSeverity(version, score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'unknown'
  if (version === '2.0') return score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low'
  if (score === 0) return 'none'
  if (score >= 9) return 'critical'
  if (score >= 7) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}

/**
 * Validates a vector and scores it.
 * `providedScore` (from the source) is used for v4.0, and cross-checked for
 * the others: our computed score wins, so a source typo can't skew severity.
 * @returns {{ version, vector, baseScore: number|null, severity }} or null if invalid
 */
export function scoreCvss(vector, providedScore = null) {
  const parsed = parseCvss(vector)
  if (!parsed) return null
  let baseScore = null
  if (parsed.version === '3.0' || parsed.version === '3.1') baseScore = scoreV3(parsed)
  else if (parsed.version === '2.0') baseScore = scoreV2(parsed)
  else if (typeof providedScore === 'number' && providedScore >= 0 && providedScore <= 10) baseScore = Math.round(providedScore * 10) / 10
  return { version: parsed.version, vector: parsed.vector, baseScore, severity: cvssSeverity(parsed.version, baseScore) }
}

const VERSION_ORDER = ['4.0', '3.1', '3.0', '2.0']

/**
 * The headline CVSS for a record: newest version that has a score, preferring
 * a source's primary assessment within a version. Returns null if none scored.
 */
export function headlineCvss(entries) {
  const scored = entries.filter((e) => typeof e.baseScore === 'number')
  scored.sort((a, b) => VERSION_ORDER.indexOf(a.version) - VERSION_ORDER.indexOf(b.version) || Number(b.primary) - Number(a.primary))
  return scored[0] ?? null
}
