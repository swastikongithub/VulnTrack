import { randomBytes } from 'node:crypto'
import { ROLE_LABELS, ROLES } from '../config/roles.js'
import { Membership, Organization } from '../models/index.js'

function slugify(name) {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `${base || 'workspace'}-${randomBytes(3).toString('hex')}`
}

/** Creates an organization and makes `userId` its owner (inside the caller's transaction). */
export async function createOrganizationWithOwner({ name, userId }, { session }) {
  const [organization] = await Organization.create([{ name, slug: slugify(name), createdBy: userId }], { session })
  const [membership] = await Membership.create(
    [{ organizationId: organization._id, userId, role: ROLES.OWNER }],
    { session },
  )
  return { organization, membership }
}

export function serializeOrganization(organization) {
  return { id: String(organization._id), name: organization.name, slug: organization.slug }
}

export function serializeMembership(membership, organization) {
  return {
    organization: serializeOrganization(organization),
    role: membership.role,
    roleLabel: ROLE_LABELS[membership.role],
  }
}

/** Active memberships for a user, oldest first, with their organizations. */
export async function listMembershipsForUser(userId) {
  const memberships = await Membership.find({ userId, status: 'active' })
    .sort({ createdAt: 1 })
    .populate('organizationId')
    .lean()
  return memberships
    .filter((m) => m.organizationId)
    .map((m) => ({ membership: m, organization: m.organizationId }))
}

/**
 * The single authorization primitive for tenant access: a membership must
 * exist for exactly this (organization, user) pair.
 */
export function findActiveMembership(organizationId, userId) {
  return Membership.findOne({ organizationId, userId, status: 'active' }).lean()
}

export async function listMembers(organizationId) {
  const members = await Membership.find({ organizationId, status: 'active' })
    .sort({ createdAt: 1 })
    .populate('userId', 'fullName email')
    .lean()
  return members
    .filter((m) => m.userId)
    .map((m) => ({
      userId: String(m.userId._id),
      fullName: m.userId.fullName,
      email: m.userId.email,
      role: m.role,
      roleLabel: ROLE_LABELS[m.role],
      joinedAt: m.createdAt,
    }))
}
