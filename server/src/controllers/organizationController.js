import { ROLE_LABELS } from '../config/roles.js'
import { Organization } from '../models/index.js'
import {
  listMembers,
  listMembershipsForUser,
  serializeMembership,
  serializeOrganization,
} from '../services/organizationService.js'
import { errors } from '../utils/errors.js'

/**
 * Tenancy foundation endpoints. Every query is scoped by the membership the
 * authorize middleware resolved — never by an unchecked client-supplied id.
 */
export const organizationController = {
  async listMine(req, res) {
    const memberships = await listMembershipsForUser(req.auth.user._id)
    res.json({ memberships: memberships.map((m) => serializeMembership(m.membership, m.organization)) })
  },

  async getOne(req, res) {
    const organization = await Organization.findById(req.membership.organizationId).lean()
    if (!organization) throw errors.notFound('Organization not found.')
    res.json({
      organization: serializeOrganization(organization),
      membership: { role: req.membership.role, roleLabel: ROLE_LABELS[req.membership.role] },
    })
  },

  async listMembers(req, res) {
    res.json({ members: await listMembers(req.membership.organizationId) })
  },
}
