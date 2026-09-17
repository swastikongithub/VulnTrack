import { PERMISSIONS } from '../config/roles.js'
import { requireAuth } from '../middleware/authenticate.js'
import { validateBody } from '../middleware/validate.js'
import {
  createInvitationSchema,
  invitationTokenSchema,
  switchOrganizationSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from '../validators/organizationValidators.js'

/**
 * Organization, member and invitation endpoints (docs/organization/api.md).
 *
 * `:organizationId` is either an organization id or the literal "current"
 * (the session's current organization). Both go through the same membership
 * resolution, so there is one code path per operation.
 */
export function registerOrganizationRoutes(router, { controller, authorization }) {
  const { requireMembership, requirePermission } = authorization
  const P = PERMISSIONS
  const org = '/organizations/:organizationId'
  const member = [requireAuth, requireMembership()]

  router.get('/organizations', requireAuth, controller.listMine)
  router.post('/organizations/switch', requireAuth, validateBody(switchOrganizationSchema), controller.switch)

  router.get(org, ...member, requirePermission(P.ORGANIZATION_READ), controller.getOne)
  router.patch(org, ...member, requirePermission(P.ORGANIZATION_UPDATE), validateBody(updateOrganizationSchema), controller.update)

  router.get(`${org}/members`, ...member, requirePermission(P.MEMBERS_READ), controller.listMembers)
  router.get(`${org}/members/:userId`, ...member, requirePermission(P.MEMBERS_READ), controller.getMember)
  router.patch(
    `${org}/members/:userId`,
    ...member,
    requirePermission(P.MEMBERS_UPDATE_ROLE),
    validateBody(updateMemberRoleSchema),
    controller.updateMemberRole,
  )
  router.delete(`${org}/members/:userId`, ...member, requirePermission(P.MEMBERS_REMOVE), controller.removeMember)

  router.get(`${org}/invitations`, ...member, requirePermission(P.MEMBERS_INVITE), controller.listInvitations)
  router.post(
    `${org}/invitations`,
    ...member,
    requirePermission(P.MEMBERS_INVITE),
    validateBody(createInvitationSchema),
    controller.createInvitation,
  )
  router.post(
    `${org}/invitations/:invitationId/resend`,
    ...member,
    requirePermission(P.MEMBERS_INVITE),
    controller.resendInvitation,
  )
  router.delete(`${org}/invitations/:invitationId`, ...member, requirePermission(P.MEMBERS_INVITE), controller.revokeInvitation)

  // Invitee side. Inspecting needs only the token; accepting needs a signed-in account.
  router.post('/invitations/inspect', validateBody(invitationTokenSchema), controller.inspectInvitation)
  router.post('/invitations/accept', requireAuth, validateBody(invitationTokenSchema), controller.acceptInvitation)
}
