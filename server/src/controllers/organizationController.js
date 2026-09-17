import { listMembershipsForUser, serializeMembership } from '../services/organizationService.js'
import { errors } from '../utils/errors.js'

/**
 * HTTP adapters for organizations, members and invitations. Every handler
 * works on `req.organization` / `req.membership` resolved by the authorize
 * middleware — never on an unchecked client-supplied id. No business rules here.
 */
export function createOrganizationController({ auth, organizations, members, invitations }) {
  const context = (req) => ({ organization: req.organization, membership: req.membership })

  return {
    async listMine(req, res) {
      const memberships = await listMembershipsForUser(req.auth.user._id)
      const preferred = String(req.auth.session.activeOrganizationId ?? '')
      const currentId = memberships.some((m) => String(m.organization._id) === preferred)
        ? preferred
        : String(memberships[0]?.organization._id ?? '')
      res.json({
        memberships: memberships.map((m) =>
          serializeMembership(m.membership, m.organization, { current: String(m.organization._id) === currentId }),
        ),
      })
    },

    async switch(req, res) {
      const switched = await organizations.switchActive(req.auth, req.body.organizationId, req.ctx)
      if (!switched) throw errors.notFound('Organization not found.')
      res.json(await auth.describeSession(req.auth.user, req.auth.session))
    },

    async getOne(req, res) {
      res.json(await organizations.getDetails(context(req)))
    },

    async update(req, res) {
      res.json(await organizations.update(context(req), req.body, req.auth, req.ctx))
    },

    async listMembers(req, res) {
      res.json({ members: await members.list(context(req)) })
    },

    async getMember(req, res) {
      res.json({ member: await members.get(context(req), req.params.userId) })
    },

    async updateMemberRole(req, res) {
      res.json({ member: await members.changeRole(context(req), req.params.userId, req.body.role, req.ctx) })
    },

    async removeMember(req, res) {
      res.json(await members.remove(context(req), req.params.userId, req.ctx))
    },

    async listInvitations(req, res) {
      res.json({ invitations: await invitations.list(context(req)) })
    },

    async createInvitation(req, res) {
      res.status(201).json({ invitation: await invitations.create(context(req), req.body, req.auth, req.ctx) })
    },

    async resendInvitation(req, res) {
      res.json({ invitation: await invitations.resend(context(req), req.params.invitationId, req.auth, req.ctx) })
    },

    async revokeInvitation(req, res) {
      res.json(await invitations.revoke(context(req), req.params.invitationId, req.auth, req.ctx))
    },

    async inspectInvitation(req, res) {
      res.json(await invitations.inspect(req.body, req.ctx))
    },

    /** Responds with the refreshed session payload; the accepted organization is now current. */
    async acceptInvitation(req, res) {
      await invitations.accept(req.body, req.auth, req.ctx)
      res.json(await auth.describeSession(req.auth.user, req.auth.session))
    },
  }
}
