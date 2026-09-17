import { createContext, useContext } from 'react'

/**
 * Current-organization data shared by the organization pages:
 *   details: GET /organizations/current → { organization, membership, permissions, assignableRoles }
 *   reload(): refetch after changes that affect it (rename, role changes).
 */
export const OrganizationContext = createContext(null)

export function useOrganization() {
  const value = useContext(OrganizationContext)
  if (!value) throw new Error('useOrganization must be used inside OrganizationLayout')
  return value
}

/** UI capability check. Presentation only — the API authorizes every action again. */
export function can(details, permission) {
  return Boolean(details?.permissions?.includes(permission))
}
