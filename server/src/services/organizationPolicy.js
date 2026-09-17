import { PERMISSIONS, ROLE_RANK, ROLE_VALUES, ROLES, roleHasPermission } from '../config/roles.js'

/**
 * Role-hierarchy rules for member and invitation management. Pure functions:
 * given the acting membership and the target, decide. Services call these and
 * turn denials into errors + audit events; the UI receives the same decisions
 * as capability flags, so both always agree.
 *
 * Rules (docs/organization/rbac.md):
 *  - Owners may assign any role, including owner, and manage any other member.
 *  - Everyone else with the permission may only assign roles strictly below
 *    their own and manage members strictly below their own role.
 *  - Nobody changes their own role or removes themselves through these actions.
 *  - At least one active owner must remain (enforced transactionally in the
 *    member service, since it depends on other memberships).
 */

const outranks = (a, b) => ROLE_RANK[a] > ROLE_RANK[b]

/** Roles `actorRole` may grant, highest first. */
export function assignableRoles(actorRole) {
  if (actorRole === ROLES.OWNER) return [...ROLE_VALUES]
  return ROLE_VALUES.filter((role) => outranks(actorRole, role))
}

export function canAssignRole(actorRole, role) {
  return assignableRoles(actorRole).includes(role)
}

/**
 * @returns {{ allowed: true } | { allowed: false, reason: 'no_permission'|'self'|'outranked' }}
 */
function decideMemberAction(actor, target, permission) {
  if (!roleHasPermission(actor.role, permission)) return { allowed: false, reason: 'no_permission' }
  if (String(actor.userId) === String(target.userId)) return { allowed: false, reason: 'self' }
  if (actor.role !== ROLES.OWNER && !outranks(actor.role, target.role)) return { allowed: false, reason: 'outranked' }
  return { allowed: true }
}

/** Changing `target`'s role to `role`. The last-owner rule is checked separately. */
export function decideRoleChange(actor, target, role) {
  const base = decideMemberAction(actor, target, PERMISSIONS.MEMBERS_UPDATE_ROLE)
  if (!base.allowed) return base
  if (!canAssignRole(actor.role, role)) return { allowed: false, reason: 'role_not_assignable' }
  return { allowed: true }
}

/** Removing `target` from the organization. The last-owner rule is checked separately. */
export function decideRemoval(actor, target) {
  return decideMemberAction(actor, target, PERMISSIONS.MEMBERS_REMOVE)
}

/** Creating, resending or revoking an invitation for `role`. */
export function decideInvitation(actorRole, role) {
  if (!roleHasPermission(actorRole, PERMISSIONS.MEMBERS_INVITE)) return { allowed: false, reason: 'no_permission' }
  if (!canAssignRole(actorRole, role)) return { allowed: false, reason: 'role_not_assignable' }
  return { allowed: true }
}

/** Capability flags for one member row, as seen by `actor`. */
export function memberActions(actor, target) {
  return {
    updateRole: decideMemberAction(actor, target, PERMISSIONS.MEMBERS_UPDATE_ROLE).allowed,
    remove: decideRemoval(actor, target).allowed,
  }
}
