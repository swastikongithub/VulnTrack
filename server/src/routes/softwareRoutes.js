import { PERMISSIONS } from '../config/roles.js'
import { requireAuth } from '../middleware/authenticate.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import { createComponentSchema, listComponentsQuerySchema, updateComponentSchema } from '../validators/softwareValidators.js'

/**
 * Software inventory endpoints (docs/software/api.md), under the same
 * organization boundary as assets. Components are created under their asset
 * and addressed by their own id afterwards.
 *
 * Permission mapping (Phase 3 catalogue, no new permissions):
 *   read                  → assets:read
 *   add / edit / remove   → assets:update (a component is part of the asset's record)
 */
export function registerSoftwareRoutes(router, { controller, authorization }) {
  const { requireMembership, requirePermission } = authorization
  const P = PERMISSIONS
  const org = '/organizations/:organizationId'
  const member = [requireAuth, requireMembership()]

  router.get(`${org}/software`, ...member, requirePermission(P.ASSETS_READ), validateQuery(listComponentsQuerySchema), controller.list)
  router.get(`${org}/software/summary`, ...member, requirePermission(P.ASSETS_READ), controller.summary)
  router.get(`${org}/software/:componentId`, ...member, requirePermission(P.ASSETS_READ), controller.get)
  router.patch(`${org}/software/:componentId`, ...member, requirePermission(P.ASSETS_UPDATE), validateBody(updateComponentSchema), controller.update)
  router.delete(`${org}/software/:componentId`, ...member, requirePermission(P.ASSETS_UPDATE), controller.remove)

  router.post(`${org}/assets/:assetId/software`, ...member, requirePermission(P.ASSETS_UPDATE), validateBody(createComponentSchema), controller.create)
}
