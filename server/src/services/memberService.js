import mongoose from 'mongoose'
import { PERMISSIONS, ROLE_LABELS, roleHasPermission, ROLES } from '../config/roles.js'
import { MEMBER_LIST_LIMIT } from '../config/security.js'
import { INVITATION_STATUS, Invitation, Membership, Organization } from '../models/index.js'
import { errors } from '../utils/errors.js'
import { isObjectIdString } from '../utils/ids.js'
import { AUDIT_ACTIONS } from './auditService.js'
import { canAssignRole, decideRemoval, decideRoleChange, memberActions } from './organizationPolicy.js'

const DENIAL_MESSAGES = {
  self: "You can't change your own membership here.",
  outranked: 'You can only manage members whose role is below yours.',
  role_not_assignable: "You can't assign that role.",
  no_permission: 'You do not have access to this resource.',
}

/**
 * Member use cases within one organization. `context` is the actor's resolved
 * `{ organization, membership }`; every query is scoped by its organization id,
 * so a user id from another tenant simply isn't found (404).
 */
export function createMemberService({ audit }) {
  function serializeMember(membership, user, actor) {
    return {
      userId: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: membership.role,
      roleLabel: ROLE_LABELS[membership.role],
      joinedAt: membership.createdAt,
      isCurrentUser: String(user._id) === String(actor.userId),
      actions: memberActions(actor, membership),
    }
  }

  async function list({ organization, membership: actor }) {
    const members = await Membership.find({ organizationId: organization._id, status: 'active' })
      .sort({ createdAt: 1 })
      .limit(MEMBER_LIST_LIMIT)
      .populate('userId', 'fullName email')
      .lean()
    return members
      .filter((m) => m.userId)
      .map((m) => serializeMember({ ...m, userId: m.userId._id }, m.userId, actor))
  }

  async function findTarget(organizationId, userId) {
    if (!isObjectIdString(userId)) throw errors.notFound('Member not found.')
    const target = await Membership.findOne({ organizationId, userId, status: 'active' })
      .populate('userId', 'fullName email')
      .lean()
    if (!target?.userId) throw errors.notFound('Member not found.')
    return { membership: { ...target, userId: target.userId._id }, user: target.userId }
  }

  async function get({ organization, membership: actor }, userId) {
    const { membership, user } = await findTarget(organization._id, userId)
    return serializeMember(membership, user, actor)
  }

  async function deny(ctx, action, { actor, organization, target, reason, metadata }) {
    await audit.record(ctx, {
      action,
      outcome: 'failure',
      userId: actor.userId,
      organizationId: organization._id,
      targetUserId: target?.userId ?? null,
      reason,
      metadata,
    })
    return reason === 'last_owner' ? errors.lastOwner() : errors.forbidden(DENIAL_MESSAGES[reason])
  }

  /**
   * Runs `work` in a transaction that also bumps the organization's roster
   * version. Concurrent roster changes therefore write-conflict and are retried
   * one after the other, so each re-checks the owner count against committed data.
   */
  function rosterTransaction(organizationId, work) {
    return mongoose.connection.transaction(async (session) => {
      await Organization.updateOne({ _id: organizationId }, { $inc: { rosterVersion: 1 } }, { session })
      return work(session)
    })
  }

  async function reloadPair(actor, target, session) {
    // Sequential: operations sharing one transaction session must not run concurrently.
    const actorNow = await Membership.findOne({ _id: actor._id, status: 'active' }).session(session).lean()
    const current = await Membership.findOne({ _id: target._id, status: 'active' }).session(session).lean()
    if (!actorNow) throw errors.forbidden()
    if (!current) throw errors.notFound('Member not found.')
    return { actorNow, current }
  }

  async function assertOwnerRemains(organizationId, session) {
    const owners = await Membership.countDocuments({ organizationId, role: ROLES.OWNER, status: 'active' }).session(session)
    if (owners < 1) throw errors.lastOwner()
  }

  /**
   * Pending invitations created by `userId` that its new role (or removal) no
   * longer authorizes are revoked, so lost authority doesn't live on in links.
   */
  async function revokeInvitationsBeyondAuthority(organizationId, userId, newRole, actorUserId, session) {
    const pending = await Invitation.find({ organizationId, invitedBy: userId, status: INVITATION_STATUS.PENDING })
      .select('role')
      .session(session)
      .lean()
    const stale = pending.filter(
      (invitation) =>
        !newRole || !roleHasPermission(newRole, PERMISSIONS.MEMBERS_INVITE) || !canAssignRole(newRole, invitation.role),
    )
    if (stale.length === 0) return
    await Invitation.updateMany(
      { _id: { $in: stale.map((i) => i._id) }, status: INVITATION_STATUS.PENDING },
      { $set: { status: INVITATION_STATUS.REVOKED, revokedAt: new Date(), revokedBy: actorUserId } },
      { session },
    )
  }

  async function changeRole({ organization, membership: actor }, userId, role, ctx) {
    const { membership: target, user } = await findTarget(organization._id, userId)
    const action = AUDIT_ACTIONS.MEMBER_ROLE_CHANGE
    const metadata = { role, previousRole: target.role }

    const decision = decideRoleChange(actor, target, role)
    if (!decision.allowed) throw await deny(ctx, action, { actor, organization, target, reason: decision.reason, metadata })
    if (target.role === role) return serializeMember(target, user, actor)

    try {
      await rosterTransaction(organization._id, async (session) => {
        // Re-read both memberships inside the transaction: either may have changed since the check above.
        const { actorNow, current } = await reloadPair(actor, target, session)
        const recheck = decideRoleChange(actorNow, current, role)
        if (!recheck.allowed) throw errors.forbidden(DENIAL_MESSAGES[recheck.reason])

        await Membership.updateOne({ _id: current._id }, { $set: { role } }, { session })
        if (current.role === ROLES.OWNER) await assertOwnerRemains(organization._id, session)
        await revokeInvitationsBeyondAuthority(organization._id, current.userId, role, actor.userId, session)
      })
    } catch (error) {
      if (error?.code === 'LAST_OWNER') {
        throw await deny(ctx, action, { actor, organization, target, reason: 'last_owner', metadata })
      }
      throw error
    }

    await audit.record(ctx, {
      action,
      outcome: 'success',
      userId: actor.userId,
      organizationId: organization._id,
      targetUserId: target.userId,
      metadata,
    })
    return serializeMember({ ...target, role }, user, actor)
  }

  async function remove({ organization, membership: actor }, userId, ctx) {
    const { membership: target } = await findTarget(organization._id, userId)
    const action = AUDIT_ACTIONS.MEMBER_REMOVE
    const metadata = { previousRole: target.role }

    const decision = decideRemoval(actor, target)
    if (!decision.allowed) throw await deny(ctx, action, { actor, organization, target, reason: decision.reason, metadata })

    try {
      await rosterTransaction(organization._id, async (session) => {
        const { actorNow, current } = await reloadPair(actor, target, session)
        const recheck = decideRemoval(actorNow, current)
        if (!recheck.allowed) throw errors.forbidden(DENIAL_MESSAGES[recheck.reason])

        await Membership.deleteOne({ _id: current._id }, { session })
        if (current.role === ROLES.OWNER) await assertOwnerRemains(organization._id, session)
        await revokeInvitationsBeyondAuthority(organization._id, current.userId, null, actor.userId, session)
      })
    } catch (error) {
      if (error?.code === 'LAST_OWNER') {
        throw await deny(ctx, action, { actor, organization, target, reason: 'last_owner', metadata })
      }
      throw error
    }

    // The removed user's sessions keep working for their other organizations; access
    // to this one ends immediately because every request re-resolves the membership.
    await audit.record(ctx, {
      action,
      outcome: 'success',
      userId: actor.userId,
      organizationId: organization._id,
      targetUserId: target.userId,
      metadata,
    })
    return { ok: true }
  }

  return { list, get, changeRole, remove }
}
