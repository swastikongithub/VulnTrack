import { AuditLog } from '../models/index.js'
import { fingerprint } from '../utils/crypto.js'

export const AUDIT_ACTIONS = Object.freeze({
  SIGNUP: 'auth.signup',
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  EMAIL_VERIFY: 'auth.email.verify',
  VERIFICATION_RESEND: 'auth.email.verification_resend',
  PASSWORD_RESET_REQUEST: 'auth.password.reset_request',
  PASSWORD_RESET: 'auth.password.reset',

  AUTHORIZATION_DENIED: 'authorization.denied',
  ORGANIZATION_UPDATE: 'organization.update',
  ORGANIZATION_SWITCH: 'organization.switch',
  MEMBER_ROLE_CHANGE: 'organization.member.role_change',
  MEMBER_REMOVE: 'organization.member.remove',
  INVITATION_CREATE: 'organization.invitation.create',
  INVITATION_RESEND: 'organization.invitation.resend',
  INVITATION_REVOKE: 'organization.invitation.revoke',
  INVITATION_ACCEPT: 'organization.invitation.accept',

  ASSET_CREATE: 'asset.create',
  ASSET_UPDATE: 'asset.update',
  ASSET_ARCHIVE: 'asset.archive',
  ASSET_RESTORE: 'asset.restore',
  ASSET_DELETE: 'asset.delete',

  SOFTWARE_CREATE: 'software.create',
  SOFTWARE_UPDATE: 'software.update',
  SOFTWARE_DELETE: 'software.delete',

  /** A vulnerability-intelligence ingestion run finished (system event: no user, no organization). */
  VULNERABILITY_SYNC: 'vulnerability.sync',
})

/**
 * Creates an audit recorder. `email` is stored only as a keyed fingerprint. Recording never throws: an audit write failure is
 * logged loudly but must not turn a successful auth operation into an error.
 */
export function createAuditService({ config, logger }) {
  async function record(
    ctx,
    {
      action,
      outcome,
      userId = null,
      organizationId = null,
      email = null,
      reason = null,
      targetUserId = null,
      invitationId = null,
      resourceType = null,
      resourceId = null,
      metadata = undefined,
    },
  ) {
    try {
      await AuditLog.create({
        action,
        outcome,
        actorUserId: userId,
        organizationId,
        subjectFingerprint: email ? fingerprint(config.authSecret, email) : null,
        reason,
        targetUserId,
        invitationId,
        resourceType,
        resourceId,
        metadata,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
        requestId: ctx?.requestId,
      })
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write audit log')
    }
  }

  return { record }
}
