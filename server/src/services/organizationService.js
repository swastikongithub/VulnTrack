import { randomBytes } from 'node:crypto'
import { assignableRoles } from './organizationPolicy.js'
import { AUDIT_ACTIONS } from './auditService.js'
import { permissionsForRole, ROLE_LABELS, ROLES } from '../config/roles.js'
import { Membership, Organization, Session } from '../models/index.js'
import { isObjectIdString } from '../utils/ids.js'

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

export function serializeMembership(membership, organization, { current } = {}) {
  return {
    organization: serializeOrganization(organization),
    role: membership.role,
    roleLabel: ROLE_LABELS[membership.role],
    ...(current === undefined ? {} : { current }),
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
    .map((m) => ({ membership: { ...m, organizationId: m.organizationId._id }, organization: m.organizationId }))
}

/**
 * The single authorization primitive for tenant access: a membership must
 * exist for exactly this (organization, user) pair.
 */
export function findActiveMembership(organizationId, userId) {
  return Membership.findOne({ organizationId, userId, status: 'active' }).lean()
}

/** Active membership + its organization, or null (non-member, unknown or malformed id). */
export async function findMembershipContext(organizationId, userId) {
  if (!isObjectIdString(String(organizationId))) return null
  const membership = await findActiveMembership(organizationId, userId)
  if (!membership) return null
  const organization = await Organization.findById(organizationId).lean()
  return organization ? { membership, organization } : null
}

/**
 * The session's current organization. `activeOrganizationId` on the session is
 * only a *preference*: it is re-validated against an active membership on every
 * request. If it no longer resolves (membership removed or suspended), the
 * oldest remaining membership becomes current and the session is corrected.
 * Returns null for a user with no active memberships.
 */
export async function resolveActiveMembership(auth) {
  const { session, user } = auth
  if (session.activeOrganizationId) {
    const preferred = await findMembershipContext(session.activeOrganizationId, user._id)
    if (preferred) return preferred
  }
  const [fallback] = await listMembershipsForUser(user._id)
  const nextId = fallback?.organization._id ?? null
  if (String(session.activeOrganizationId ?? '') !== String(nextId ?? '')) {
    await Session.updateOne({ _id: session._id }, { $set: { activeOrganizationId: nextId } })
    session.activeOrganizationId = nextId
  }
  return fallback ?? null
}

/** What the caller may do in this organization: derived server-side, used by the UI, never trusted back. */
export function describeAccess(membership) {
  return {
    membership: { role: membership.role, roleLabel: ROLE_LABELS[membership.role] },
    permissions: permissionsForRole(membership.role),
    assignableRoles: assignableRoles(membership.role).map((role) => ({ value: role, label: ROLE_LABELS[role] })),
  }
}

/**
 * Organization use cases. `context` is `{ organization, membership }` as
 * resolved by the requireMembership middleware — never a client-supplied id.
 */
export function createOrganizationService({ audit }) {
  async function getDetails({ organization, membership }) {
    const memberCount = await Membership.countDocuments({ organizationId: organization._id, status: 'active' })
    return {
      organization: {
        ...serializeOrganization(organization),
        createdAt: organization.createdAt,
        memberCount,
      },
      ...describeAccess(membership),
    }
  }

  async function update({ organization, membership }, { name }, auth, ctx) {
    const changed = name !== organization.name
    if (changed) {
      await Organization.updateOne({ _id: organization._id }, { $set: { name } })
      await audit.record(ctx, {
        action: AUDIT_ACTIONS.ORGANIZATION_UPDATE,
        outcome: 'success',
        userId: auth.user._id,
        organizationId: organization._id,
        metadata: { fields: ['name'] },
      })
    }
    return getDetails({ organization: { ...organization, name }, membership })
  }

  /** Makes `organizationId` the session's current organization, if the user is an active member. */
  async function switchActive(auth, organizationId, ctx) {
    const context = await findMembershipContext(organizationId, auth.user._id)
    if (!context) {
      await audit.record(ctx, {
        action: AUDIT_ACTIONS.ORGANIZATION_SWITCH,
        outcome: 'failure',
        userId: auth.user._id,
        reason: 'not_a_member',
      })
      return null
    }
    const previous = auth.session.activeOrganizationId
    await Session.updateOne({ _id: auth.session._id }, { $set: { activeOrganizationId: context.organization._id } })
    auth.session.activeOrganizationId = context.organization._id
    if (String(previous) !== String(context.organization._id)) {
      await audit.record(ctx, {
        action: AUDIT_ACTIONS.ORGANIZATION_SWITCH,
        outcome: 'success',
        userId: auth.user._id,
        organizationId: context.organization._id,
      })
    }
    return context
  }

  return { getDetails, update, switchActive }
}
