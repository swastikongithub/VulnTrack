import { apiRequest } from '../api/httpClient'

/**
 * Vulnerability matches for the current organization (docs/matching/api.md).
 *
 * Matches are derived data: the only write is `recalculate`, which recomputes
 * them from the inventory and the catalogue. Nothing here edits a match.
 */

const base = '/organizations/current/matches'
const enc = encodeURIComponent

const QUERY_KEYS = ['q', 'status', 'confidence', 'severity', 'ecosystem', 'exploited', 'assetId', 'vulnerabilityId', 'archived', 'sort', 'page', 'pageSize']

export function listMatches(params = {}) {
  const query = new URLSearchParams()
  for (const key of QUERY_KEYS) {
    const value = params[key]
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return apiRequest(suffix ? `${base}?${suffix}` : base)
}

export const getMatchSummary = () => apiRequest(`${base}/summary`)

export const getMatch = (matchId) => apiRequest(`${base}/${enc(matchId)}`).then((body) => body.match)

/** Recomputes this organization's matches (needs findings:create). Returns the finished run. */
export const recalculateMatches = () => apiRequest(`${base}/recalculate`, { method: 'POST', body: {} }).then((body) => body.run)
