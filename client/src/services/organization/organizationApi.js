import { apiRequest } from '../api/httpClient'

/**
 * Organization, member and invitation API (docs/organization/api.md).
 *
 * Calls target the session's *current* organization ("current"); the server
 * resolves it from the session and re-checks membership and permissions on
 * every request. Capability data returned here (permissions, per-member
 * `actions`, `assignableRoles`) only shapes the UI — the server enforces.
 */

const current = '/organizations/current'
const enc = encodeURIComponent

export const getCurrentOrganization = () => apiRequest(current)

export const updateOrganization = ({ name }) => apiRequest(current, { method: 'PATCH', body: { name } })

export const listMembers = () => apiRequest(`${current}/members`)

export const updateMemberRole = (userId, role) =>
  apiRequest(`${current}/members/${enc(userId)}`, { method: 'PATCH', body: { role } })

export const removeMember = (userId) => apiRequest(`${current}/members/${enc(userId)}`, { method: 'DELETE' })

export const listInvitations = () => apiRequest(`${current}/invitations`)

export const createInvitation = ({ email, role }) =>
  apiRequest(`${current}/invitations`, { method: 'POST', body: { email, role } })

export const resendInvitation = (id) => apiRequest(`${current}/invitations/${enc(id)}/resend`, { method: 'POST', body: {} })

export const revokeInvitation = (id) => apiRequest(`${current}/invitations/${enc(id)}`, { method: 'DELETE' })

/** @returns the refreshed session payload for the newly current organization */
export const switchOrganization = (organizationId) =>
  apiRequest('/organizations/switch', { method: 'POST', body: { organizationId } })

export const inspectInvitation = (token) => apiRequest('/invitations/inspect', { method: 'POST', body: { token: token ?? '' } })

/** @returns the refreshed session payload; the invited organization is now current */
export const acceptInvitation = (token) => apiRequest('/invitations/accept', { method: 'POST', body: { token: token ?? '' } })

/** UI action pacing (see apiAuthService): keeps loading states from flashing. */
export async function paced(promise, minimumMs = 450) {
  const started = performance.now()
  const settle = async () => {
    const remaining = minimumMs - (performance.now() - started)
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
  }
  try {
    const result = await promise
    await settle()
    return result
  } catch (error) {
    await settle()
    throw error
  }
}
