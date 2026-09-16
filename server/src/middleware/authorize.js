import mongoose from 'mongoose'
import { roleHasPermission } from '../config/roles.js'
import { findActiveMembership } from '../services/organizationService.js'
import { errors } from '../utils/errors.js'

/**
 * Tenant boundary. Resolves the caller's membership in the organization named
 * by the route parameter. Non-members get 404 (not 403) so organization ids
 * cannot be probed for existence. Must run after requireAuth.
 */
export function requireMembership(param = 'organizationId') {
  return async (req, _res, next) => {
    const organizationId = req.params[param]
    if (!mongoose.isValidObjectId(organizationId)) return next(errors.notFound('Organization not found.'))

    const membership = await findActiveMembership(organizationId, req.auth.user._id)
    if (!membership) return next(errors.notFound('Organization not found.'))

    req.membership = membership
    next()
  }
}

/** Role-based permission check within the resolved membership. */
export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.membership || !roleHasPermission(req.membership.role, permission)) return next(errors.forbidden())
    next()
  }
}
