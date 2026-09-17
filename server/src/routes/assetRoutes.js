import { PERMISSIONS } from '../config/roles.js'
import { requireAuth } from '../middleware/authenticate.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import {
  assetRevisionSchema,
  createAssetSchema,
  listAssetsQuerySchema,
  updateAssetSchema,
} from '../validators/assetValidators.js'

/**
 * Asset inventory endpoints (docs/assets/api.md). Mounted under the same
 * organization boundary as members and invitations: `:organizationId` is an id
 * or "current", resolved to an active membership before any permission check.
 *
 * Permission mapping (Phase 3 catalogue, no new permissions):
 *   read                       → assets:read
 *   create                     → assets:create
 *   edit fields / lifecycle    → assets:update
 *   archive / restore / delete → assets:delete
 */
export function registerAssetRoutes(router, { controller, authorization }) {
  const { requireMembership, requirePermission } = authorization
  const P = PERMISSIONS
  const assets = '/organizations/:organizationId/assets'
  const member = [requireAuth, requireMembership()]

  router.get(assets, ...member, requirePermission(P.ASSETS_READ), validateQuery(listAssetsQuerySchema), controller.list)
  router.get(`${assets}/summary`, ...member, requirePermission(P.ASSETS_READ), controller.summary)
  router.post(assets, ...member, requirePermission(P.ASSETS_CREATE), validateBody(createAssetSchema), controller.create)

  router.get(`${assets}/:assetId`, ...member, requirePermission(P.ASSETS_READ), controller.get)
  router.patch(`${assets}/:assetId`, ...member, requirePermission(P.ASSETS_UPDATE), validateBody(updateAssetSchema), controller.update)
  router.post(`${assets}/:assetId/archive`, ...member, requirePermission(P.ASSETS_DELETE), validateBody(assetRevisionSchema), controller.archive)
  router.post(`${assets}/:assetId/restore`, ...member, requirePermission(P.ASSETS_DELETE), validateBody(assetRevisionSchema), controller.restore)
  router.delete(`${assets}/:assetId`, ...member, requirePermission(P.ASSETS_DELETE), controller.remove)
}
