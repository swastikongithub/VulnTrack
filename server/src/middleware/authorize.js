import { roleHasPermission } from '../config/roles.js'
import { AUDIT_ACTIONS } from '../services/auditService.js'
import { findMembershipContext, resolveActiveMembership } from '../services/organizationService.js'
import { errors } from '../utils/errors.js'

/** Route value naming the session's current organization instead of an explicit id. */
export const CURRENT_ORGANIZATION = 'current'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Tenant boundary + permission checks. Must run after requireAuth.
 *
 * requireMembership resolves `req.params[param]` — either "current" (the
 * session's current organization) or an explicit organization id — to the
 * caller's *active* membership, and sets `req.organization` / `req.membership`.
 * Non-members, unknown ids and malformed ids all get the same 404, so
 * organization ids can't be probed for existence.
 *
 * requirePermission checks the resolved membership's role against the central
 * permission map (config/roles.js). Denied state-changing requests are audited.
 */
export function createAuthorization({ audit }) {
  function requireMembership(param = 'organizationId') {
    return async (req, _res, next) => {
      const ref = req.params[param]
      const context =
        ref === CURRENT_ORGANIZATION
          ? await resolveActiveMembership(req.auth)
          : await findMembershipContext(ref, req.auth.user._id)

      if (!context) return next(errors.notFound('Organization not found.'))
      req.organization = context.organization
      req.membership = context.membership
      next()
    }
  }

  function requirePermission(permission) {
    return async (req, _res, next) => {
      if (req.membership && roleHasPermission(req.membership.role, permission)) return next()
      if (req.membership && !SAFE_METHODS.has(req.method)) {
        await audit.record(req.ctx, {
          action: AUDIT_ACTIONS.AUTHORIZATION_DENIED,
          outcome: 'failure',
          userId: req.auth?.user._id,
          organizationId: req.membership.organizationId,
          reason: 'missing_permission',
          metadata: { permission, role: req.membership.role },
        })
      }
      next(errors.forbidden())
    }
  }

  return { requireMembership, requirePermission }
}
