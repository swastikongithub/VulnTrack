import { apiRequest } from '../api/httpClient'

/**
 * Asset inventory API for the current organization (docs/assets/api.md).
 * `actions` flags on each asset shape the UI; the server authorizes every call.
 */

const base = '/organizations/current/assets'
const enc = encodeURIComponent

/** Only known, non-empty query parameters are sent. */
const QUERY_KEYS = ['q', 'type', 'environment', 'criticality', 'exposure', 'status', 'tag', 'archived', 'sort', 'order', 'page', 'pageSize']

export function listAssets(params = {}) {
  const query = new URLSearchParams()
  for (const key of QUERY_KEYS) {
    const value = params[key]
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return apiRequest(suffix ? `${base}?${suffix}` : base)
}

export const getAssetSummary = () => apiRequest(`${base}/summary`)

export const getAsset = (id) => apiRequest(`${base}/${enc(id)}`).then((body) => body.asset)

export const createAsset = (input) => apiRequest(base, { method: 'POST', body: input }).then((body) => body.asset)

export const updateAsset = (id, input) =>
  apiRequest(`${base}/${enc(id)}`, { method: 'PATCH', body: input }).then((body) => body.asset)

export const archiveAsset = (id, revision) =>
  apiRequest(`${base}/${enc(id)}/archive`, { method: 'POST', body: { revision } }).then((body) => body.asset)

export const restoreAsset = (id, revision) =>
  apiRequest(`${base}/${enc(id)}/restore`, { method: 'POST', body: { revision } }).then((body) => body.asset)

export const deleteAsset = (id) => apiRequest(`${base}/${enc(id)}`, { method: 'DELETE' })
