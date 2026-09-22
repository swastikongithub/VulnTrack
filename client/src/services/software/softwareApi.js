import { apiRequest } from '../api/httpClient'

/**
 * Software inventory API for the current organization (docs/software/api.md).
 * `actions` flags on each component shape the UI; the server authorizes every call.
 */

const org = '/organizations/current'
const enc = encodeURIComponent

/** Only known, non-empty query parameters are sent. */
const QUERY_KEYS = ['q', 'assetId', 'ecosystem', 'relationship', 'scope', 'version', 'sort', 'order', 'page', 'pageSize']

export function listComponents(params = {}) {
  const query = new URLSearchParams()
  for (const key of QUERY_KEYS) {
    const value = params[key]
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return apiRequest(suffix ? `${org}/software?${suffix}` : `${org}/software`)
}

export const getSoftwareSummary = () => apiRequest(`${org}/software/summary`)

export const createComponent = (assetId, input) =>
  apiRequest(`${org}/assets/${enc(assetId)}/software`, { method: 'POST', body: input }).then((body) => body.component)

export const updateComponent = (id, input) =>
  apiRequest(`${org}/software/${enc(id)}`, { method: 'PATCH', body: input }).then((body) => body.component)

export const deleteComponent = (id) => apiRequest(`${org}/software/${enc(id)}`, { method: 'DELETE' })
