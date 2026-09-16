/**
 * RBAC foundation. Roles are scoped to an organization membership, never
 * global to a user. Permissions are intentionally limited to what exists
 * today (organization + member visibility); future domains add their own.
 *
 * Mirrors the conceptual matrix in the master plan (§5.10).
 */

export const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  SECURITY_ANALYST: 'security_analyst',
  DEVELOPER: 'developer',
  VIEWER: 'viewer',
})

export const ROLE_VALUES = Object.freeze(Object.values(ROLES))

export const ROLE_LABELS = Object.freeze({
  owner: 'Owner',
  admin: 'Admin',
  security_analyst: 'Security Analyst',
  developer: 'Developer',
  viewer: 'Viewer',
})

export const PERMISSIONS = Object.freeze({
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',
  MEMBERS_READ: 'members:read',
  MEMBERS_MANAGE: 'members:manage',
})

const P = PERMISSIONS

const ROLE_PERMISSIONS = Object.freeze({
  owner: new Set([P.ORGANIZATION_READ, P.ORGANIZATION_UPDATE, P.MEMBERS_READ, P.MEMBERS_MANAGE]),
  admin: new Set([P.ORGANIZATION_READ, P.ORGANIZATION_UPDATE, P.MEMBERS_READ, P.MEMBERS_MANAGE]),
  security_analyst: new Set([P.ORGANIZATION_READ, P.MEMBERS_READ]),
  developer: new Set([P.ORGANIZATION_READ]),
  viewer: new Set([P.ORGANIZATION_READ]),
})

export function roleHasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}
