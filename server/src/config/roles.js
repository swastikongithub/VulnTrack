/**
 * RBAC policy: roles, the permission catalogue and the role → permission grants.
 *
 * Roles are scoped to an organization membership, never global to a user.
 * Code checks *permissions*, never role names, so adding a permission (or
 * changing who holds it) is a one-line change here and needs no middleware
 * or controller edits. Role *hierarchy* rules (who may manage whom) live in
 * services/organizationPolicy.js.
 *
 * Refines the conceptual matrix in the master plan (§5.10). The full matrix
 * and the reasoning behind each grant: docs/organization/rbac.md
 */

export const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  SECURITY_ANALYST: 'security_analyst',
  DEVELOPER: 'developer',
  VIEWER: 'viewer',
})

/** Highest authority first. */
export const ROLE_VALUES = Object.freeze(Object.values(ROLES))

export const ROLE_LABELS = Object.freeze({
  owner: 'Owner',
  admin: 'Admin',
  security_analyst: 'Security Analyst',
  developer: 'Developer',
  viewer: 'Viewer',
})

/**
 * Authority rank for hierarchy decisions only (an admin can't manage an owner).
 * Never use rank to answer "may this role do X" — that is what permissions are for.
 */
export const ROLE_RANK = Object.freeze({
  owner: 50,
  admin: 40,
  security_analyst: 30,
  developer: 20,
  viewer: 10,
})

export const PERMISSIONS = Object.freeze({
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',

  MEMBERS_READ: 'members:read',
  MEMBERS_INVITE: 'members:invite',
  MEMBERS_UPDATE_ROLE: 'members:update_role',
  MEMBERS_REMOVE: 'members:remove',

  // Product permissions. assets:* (Phase 4), vulnerabilities:read (Phase 6) and
  // findings:create (Phase 7, recalculating matches) are in use; the rest are
  // reserved for later phases, granted here so the matrix is reviewed as a whole.
  ASSETS_READ: 'assets:read',
  ASSETS_CREATE: 'assets:create',
  ASSETS_UPDATE: 'assets:update',
  ASSETS_DELETE: 'assets:delete',
  VULNERABILITIES_READ: 'vulnerabilities:read',
  FINDINGS_READ: 'findings:read',
  FINDINGS_CREATE: 'findings:create',
  FINDINGS_UPDATE: 'findings:update',
  REMEDIATION_MANAGE: 'remediation:manage',
  SCANS_RUN: 'scans:run',
})

const { OWNER, ADMIN, SECURITY_ANALYST, DEVELOPER, VIEWER } = ROLES
const P = PERMISSIONS

const EVERYONE = [OWNER, ADMIN, SECURITY_ANALYST, DEVELOPER, VIEWER]
const MANAGERS = [OWNER, ADMIN]
const SECURITY_TEAM = [OWNER, ADMIN, SECURITY_ANALYST]

/** permission → roles holding it. Default deny: a role not listed does not have the permission. */
const GRANTS = Object.freeze({
  [P.ORGANIZATION_READ]: EVERYONE,
  [P.ORGANIZATION_UPDATE]: MANAGERS,

  [P.MEMBERS_READ]: SECURITY_TEAM,
  [P.MEMBERS_INVITE]: MANAGERS,
  [P.MEMBERS_UPDATE_ROLE]: MANAGERS,
  [P.MEMBERS_REMOVE]: MANAGERS,

  [P.ASSETS_READ]: EVERYONE,
  [P.ASSETS_CREATE]: SECURITY_TEAM,
  [P.ASSETS_UPDATE]: SECURITY_TEAM,
  [P.ASSETS_DELETE]: MANAGERS,
  [P.VULNERABILITIES_READ]: EVERYONE,
  [P.FINDINGS_READ]: EVERYONE,
  [P.FINDINGS_CREATE]: SECURITY_TEAM,
  // Developers will update findings assigned to them through a separate, row-scoped
  // permission when findings exist; a blanket grant here would be too broad.
  [P.FINDINGS_UPDATE]: SECURITY_TEAM,
  [P.REMEDIATION_MANAGE]: SECURITY_TEAM,
  [P.SCANS_RUN]: SECURITY_TEAM,
})

// Fail at startup, not at request time, if the catalogue and the grants drift apart.
for (const permission of Object.values(PERMISSIONS)) {
  if (!GRANTS[permission]) throw new Error(`RBAC: permission "${permission}" has no grant entry`)
}
for (const [permission, roles] of Object.entries(GRANTS)) {
  if (!Object.values(PERMISSIONS).includes(permission)) throw new Error(`RBAC: unknown permission "${permission}"`)
  for (const role of roles) if (!ROLE_VALUES.includes(role)) throw new Error(`RBAC: unknown role "${role}"`)
}

const ROLE_PERMISSIONS = Object.freeze(
  Object.fromEntries(
    ROLE_VALUES.map((role) => [
      role,
      new Set(Object.entries(GRANTS).filter(([, roles]) => roles.includes(role)).map(([permission]) => permission)),
    ]),
  ),
)

export function roleHasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

/** Sorted permission list for a role (sent to the client to shape the UI; never trusted back). */
export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[role] ?? [])].sort()
}

export function isRole(value) {
  return ROLE_VALUES.includes(value)
}
