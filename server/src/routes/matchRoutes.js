import { PERMISSIONS } from '../config/roles.js'
import { requireAuth } from '../middleware/authenticate.js'
import { validateQuery } from '../middleware/validate.js'
import { listMatchesQuerySchema } from '../validators/matchValidators.js'

/**
 * Vulnerability matching endpoints (docs/matching/api.md).
 *
 * Permission mapping (Phase 3 catalogue, no new permissions):
 *   read        → vulnerabilities:read (every role, like the catalogue itself)
 *   recalculate → findings:create (owner, admin, security analyst)
 *
 * Recalculating is the step that produces what findings will be made from, and
 * it reads the organization's whole inventory, so it belongs to the security
 * team rather than to everyone who can read.
 */
export function registerMatchRoutes(router, { controller, authorization }) {
  const { requireMembership, requirePermission } = authorization
  const base = '/organizations/:organizationId/matches'
  const member = [requireAuth, requireMembership()]
  const read = requirePermission(PERMISSIONS.VULNERABILITIES_READ)

  // `summary` before `:matchId`, so the literal path is not read as an id.
  router.get(`${base}/summary`, ...member, read, controller.summary)
  router.get(base, ...member, read, validateQuery(listMatchesQuerySchema), controller.list)
  router.get(`${base}/:matchId`, ...member, read, controller.get)

  router.post(`${base}/recalculate`, ...member, requirePermission(PERMISSIONS.FINDINGS_CREATE), controller.recalculate)
}
