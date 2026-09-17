import mongoose from 'mongoose'
import { PERMISSIONS, ROLE_LABELS, roleHasPermission } from '../config/roles.js'
import { RATE_LIMITS, TOKEN_POLICY } from '../config/security.js'
import { INVITATION_STATUS, Invitation, Membership, normalizeEmail, Organization, Session, User } from '../models/index.js'
import { generateToken, hashToken, looksLikeToken } from '../utils/crypto.js'
import { errors } from '../utils/errors.js'
import { isObjectIdString } from '../utils/ids.js'
import { AUDIT_ACTIONS } from './auditService.js'
import { emailTemplates } from './emailService.js'
import { canAssignRole, decideInvitation } from './organizationPolicy.js'
import * as rateLimits from './rateLimitService.js'

const DUPLICATE_KEY = 11000
const { PENDING, ACCEPTED, REVOKED, EXPIRED } = INVITATION_STATUS

const DENIAL_MESSAGES = {
  no_permission: 'You do not have access to this resource.',
  role_not_assignable: "You can't invite someone with that role.",
}

/**
 * Invitation lifecycle: create → (resend)* → accept | revoke | expire.
 *
 * Token handling mirrors the one-time email tokens (tokenService): 256-bit
 * random values, only SHA-256 digests stored, a newer link supersedes older
 * ones, and consumption is a single atomic update. Delivery is by email; the
 * lifecycle itself never depends on delivery succeeding.
 */
export function createInvitationService({ config, mailer, audit }) {
  const ipKey = (prefix, ctx) => `${prefix}:ip:${ctx.ip ?? 'unknown'}`
  const now = () => new Date()

  const isExpired = (invitation) => invitation.expiresAt.getTime() <= Date.now()
  const effectiveStatus = (invitation) =>
    invitation.status === PENDING && isExpired(invitation) ? EXPIRED : invitation.status

  function lifetime() {
    const expiresAt = new Date(Date.now() + TOKEN_POLICY.invitation.ttlMs)
    return { expiresAt, purgeAt: new Date(expiresAt.getTime() + TOKEN_POLICY.invitationRetainAfterExpiryMs) }
  }

  function serialize(invitation, actorRole) {
    const manageable = decideInvitation(actorRole, invitation.role).allowed
    const status = effectiveStatus(invitation)
    return {
      id: String(invitation._id),
      email: invitation.email,
      role: invitation.role,
      roleLabel: ROLE_LABELS[invitation.role],
      status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      lastSentAt: invitation.lastSentAt,
      invitedBy: invitation.invitedBy?.fullName
        ? { id: String(invitation.invitedBy._id), fullName: invitation.invitedBy.fullName }
        : null,
      actions: { resend: manageable, revoke: manageable },
    }
  }

  async function deny(ctx, action, { actor, organization, reason, invitation, role, email }) {
    await audit.record(ctx, {
      action,
      outcome: 'failure',
      userId: actor.userId,
      organizationId: organization._id,
      invitationId: invitation?._id ?? null,
      email,
      reason,
      metadata: { role },
    })
    return errors.forbidden(DENIAL_MESSAGES[reason])
  }

  function send(invitation, token, { organization, inviter }) {
    mailer.dispatch(
      emailTemplates.invitation(config, {
        to: invitation.email,
        organizationName: organization.name,
        inviterName: inviter.fullName,
        roleLabel: ROLE_LABELS[invitation.role],
        token,
        expiresAt: invitation.expiresAt,
      }),
    )
  }

  // ── Managed by organization members (requires members:invite) ───────────

  /** Pending invitations, including ones that have expired but can still be resent. */
  async function list({ organization, membership: actor }) {
    const invitations = await Invitation.find({ organizationId: organization._id, status: PENDING })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('invitedBy', 'fullName')
      .lean()
    return invitations.map((invitation) => serialize(invitation, actor.role))
  }

  async function create({ organization, membership: actor }, { email, role }, auth, ctx) {
    const action = AUDIT_ACTIONS.INVITATION_CREATE
    const emailNormalized = normalizeEmail(email)

    const decision = decideInvitation(actor.role, role)
    if (!decision.allowed) {
      throw await deny(ctx, action, { actor, organization, reason: decision.reason, role, email: emailNormalized })
    }

    await rateLimits.enforce(
      `invitation-create:org:${organization._id}`,
      RATE_LIMITS.invitationCreateOrganization,
      'client',
    )

    // Existing members can't be invited again (visible to this admin through the member list anyway).
    const existingUser = await User.findOne({ emailNormalized }).select('_id').lean()
    if (existingUser && (await Membership.exists({ organizationId: organization._id, userId: existingUser._id }))) {
      throw errors.alreadyMember()
    }

    // A pending-but-expired invitation for this address is superseded rather than blocking.
    await Invitation.updateMany(
      { organizationId: organization._id, emailNormalized, status: PENDING, expiresAt: { $lte: now() } },
      { $set: { status: EXPIRED } },
    )

    const token = generateToken()
    let invitation
    try {
      invitation = await Invitation.create({
        organizationId: organization._id,
        email: email.trim(),
        emailNormalized,
        role,
        tokenHash: hashToken(token),
        invitedBy: auth.user._id,
        lastSentAt: now(),
        ...lifetime(),
      })
    } catch (error) {
      if (error?.code === DUPLICATE_KEY) throw errors.invitationExists()
      throw error
    }

    send(invitation, token, { organization, inviter: auth.user })
    await audit.record(ctx, {
      action,
      outcome: 'success',
      userId: auth.user._id,
      organizationId: organization._id,
      invitationId: invitation._id,
      email: emailNormalized,
      metadata: { role },
    })
    return serialize({ ...invitation.toObject(), invitedBy: auth.user }, actor.role)
  }

  async function findManaged(organizationId, invitationId) {
    if (!isObjectIdString(invitationId)) throw errors.notFound('Invitation not found.')
    // Scoped by organization: another tenant's invitation id is simply not found.
    const invitation = await Invitation.findOne({ _id: invitationId, organizationId, status: PENDING }).lean()
    if (!invitation) throw errors.notFound('Invitation not found.')
    return invitation
  }

  async function resend({ organization, membership: actor }, invitationId, auth, ctx) {
    const action = AUDIT_ACTIONS.INVITATION_RESEND
    const invitation = await findManaged(organization._id, invitationId)

    const decision = decideInvitation(actor.role, invitation.role)
    if (!decision.allowed) {
      throw await deny(ctx, action, { actor, organization, reason: decision.reason, invitation, role: invitation.role })
    }

    await rateLimits.enforce(`invitation-resend:${invitation._id}`, RATE_LIMITS.invitationResendInterval, 'account')
    await rateLimits.enforce(`invitation-resend-hourly:${invitation._id}`, RATE_LIMITS.invitationResendHourly, 'account')

    // A new token replaces the old digest, so earlier links stop working.
    const token = generateToken()
    const updated = await Invitation.findOneAndUpdate(
      { _id: invitation._id, status: PENDING },
      { $set: { tokenHash: hashToken(token), lastSentAt: now(), ...lifetime() }, $inc: { sendCount: 1 } },
      { returnDocument: 'after' },
    )
      .populate('invitedBy', 'fullName')
      .lean()
    if (!updated) throw errors.notFound('Invitation not found.')

    send(updated, token, { organization, inviter: auth.user })
    await audit.record(ctx, {
      action,
      outcome: 'success',
      userId: auth.user._id,
      organizationId: organization._id,
      invitationId: invitation._id,
      metadata: { role: invitation.role },
    })
    return serialize(updated, actor.role)
  }

  async function revoke({ organization, membership: actor }, invitationId, auth, ctx) {
    const action = AUDIT_ACTIONS.INVITATION_REVOKE
    const invitation = await findManaged(organization._id, invitationId)

    const decision = decideInvitation(actor.role, invitation.role)
    if (!decision.allowed) {
      throw await deny(ctx, action, { actor, organization, reason: decision.reason, invitation, role: invitation.role })
    }

    const result = await Invitation.updateOne(
      { _id: invitation._id, status: PENDING },
      { $set: { status: REVOKED, revokedAt: now(), revokedBy: auth.user._id } },
    )
    if (result.modifiedCount === 0) throw errors.notFound('Invitation not found.')

    await audit.record(ctx, {
      action,
      outcome: 'success',
      userId: auth.user._id,
      organizationId: organization._id,
      invitationId: invitation._id,
      metadata: { role: invitation.role },
    })
    return { ok: true }
  }

  // ── Used by the invitee (token holder) ───────────────────────────────────

  /** Resolves a presented token to a usable invitation, or throws TOKEN_INVALID / TOKEN_EXPIRED. */
  async function usableInvitation(token) {
    if (!looksLikeToken(token)) throw errors.tokenInvalid()
    const invitation = await Invitation.findOne({ tokenHash: hashToken(token) }).lean()
    if (!invitation || invitation.status === ACCEPTED || invitation.status === REVOKED) throw errors.tokenInvalid()
    if (invitation.status === EXPIRED || isExpired(invitation)) throw errors.tokenExpired()
    const organization = await Organization.findById(invitation.organizationId).lean()
    if (!organization) throw errors.tokenInvalid()
    return { invitation, organization }
  }

  /**
   * What the link is for. Shown to whoever holds the token (the recipient of the
   * email), so it includes the invited address and organization name — nothing else.
   */
  async function inspect({ token }, ctx) {
    await rateLimits.enforce(ipKey('token', ctx), RATE_LIMITS.tokenIp, 'client')
    const { invitation, organization } = await usableInvitation(token)
    const inviter = await User.findById(invitation.invitedBy).select('fullName').lean()
    return {
      invitation: {
        email: invitation.email,
        role: invitation.role,
        roleLabel: ROLE_LABELS[invitation.role],
        expiresAt: invitation.expiresAt,
        organization: { id: String(organization._id), name: organization.name },
        invitedBy: inviter ? { fullName: inviter.fullName } : null,
      },
    }
  }

  /**
   * Accepts an invitation for the signed-in user. The account's verified email
   * must match the invited address; the role comes from the invitation record.
   * The new organization becomes the session's current organization.
   */
  async function accept({ token }, auth, ctx) {
    const action = AUDIT_ACTIONS.INVITATION_ACCEPT
    await rateLimits.enforce(ipKey('token', ctx), RATE_LIMITS.tokenIp, 'client')

    let resolved
    try {
      resolved = await usableInvitation(token)
    } catch (error) {
      await audit.record(ctx, { action, outcome: 'failure', userId: auth.user._id, reason: error.code?.toLowerCase() })
      throw error
    }
    const { invitation, organization } = resolved
    const failure = (reason) =>
      audit.record(ctx, {
        action,
        outcome: 'failure',
        userId: auth.user._id,
        organizationId: organization._id,
        invitationId: invitation._id,
        reason,
      })

    if (invitation.emailNormalized !== auth.user.emailNormalized) {
      await failure('email_mismatch')
      throw errors.invitationEmailMismatch()
    }

    if (await Membership.exists({ organizationId: organization._id, userId: auth.user._id })) {
      await failure('already_member')
      throw errors.alreadyMember()
    }

    // The inviter's authority is re-checked at acceptance: an invitation from someone
    // who has since been removed or demoted must not grant a role they can't grant now.
    const inviter = await Membership.findOne({
      organizationId: organization._id,
      userId: invitation.invitedBy,
      status: 'active',
    }).lean()
    if (!inviter || !roleHasPermission(inviter.role, PERMISSIONS.MEMBERS_INVITE) || !canAssignRole(inviter.role, invitation.role)) {
      await Invitation.updateOne({ _id: invitation._id, status: PENDING }, { $set: { status: REVOKED, revokedAt: now() } })
      await failure('inviter_authority_lost')
      throw errors.tokenInvalid()
    }

    try {
      await mongoose.connection.transaction(async (session) => {
        const acceptedAt = now()
        // Atomic single use: only one request can move this token from pending to accepted.
        const consumed = await Invitation.findOneAndUpdate(
          { _id: invitation._id, tokenHash: invitation.tokenHash, status: PENDING, expiresAt: { $gt: acceptedAt } },
          { $set: { status: ACCEPTED, acceptedAt, acceptedBy: auth.user._id } },
          { returnDocument: 'after', session },
        ).lean()
        if (!consumed) throw errors.tokenInvalid()

        await Membership.create([{ organizationId: organization._id, userId: auth.user._id, role: consumed.role }], {
          session,
        })
        await Session.updateOne(
          { _id: auth.session._id },
          { $set: { activeOrganizationId: organization._id } },
          { session },
        )
      })
    } catch (error) {
      if (error?.code === DUPLICATE_KEY) {
        await failure('already_member')
        throw errors.alreadyMember()
      }
      await failure(error.code?.toLowerCase?.() ?? 'error')
      throw error
    }

    auth.session.activeOrganizationId = organization._id
    await audit.record(ctx, {
      action,
      outcome: 'success',
      userId: auth.user._id,
      organizationId: organization._id,
      invitationId: invitation._id,
      metadata: { role: invitation.role },
    })
    return { organization, role: invitation.role }
  }

  return { list, create, resend, revoke, inspect, accept }
}
