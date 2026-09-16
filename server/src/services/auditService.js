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
})

/**
 * Creates an audit recorder. Recording never throws: an audit write failure is
 * logged loudly but must not turn a successful auth operation into an error.
 */
export function createAuditService({ config, logger }) {
  async function record(ctx, { action, outcome, userId = null, organizationId = null, email = null, reason = null }) {
    try {
      await AuditLog.create({
        action,
        outcome,
        actorUserId: userId,
        organizationId,
        subjectFingerprint: email ? fingerprint(config.authSecret, email) : null,
        reason,
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
