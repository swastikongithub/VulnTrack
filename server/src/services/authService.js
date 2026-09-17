import mongoose from 'mongoose'
import { permissionsForRole, ROLE_LABELS } from '../config/roles.js'
import { RATE_LIMITS } from '../config/security.js'
import { normalizeEmail, TOKEN_PURPOSES, User } from '../models/index.js'
import { fingerprint } from '../utils/crypto.js'
import { errors } from '../utils/errors.js'
import { AUDIT_ACTIONS } from './auditService.js'
import { emailTemplates } from './emailService.js'
import {
  createOrganizationWithOwner,
  listMembershipsForUser,
  serializeMembership,
  serializeOrganization,
} from './organizationService.js'
import { hashPassword, passwordPolicyError, verifyAgainstDummy, verifyPassword } from './passwordService.js'
import * as rateLimits from './rateLimitService.js'
import { consumeToken, inspectToken, invalidateTokens, issueToken } from './tokenService.js'

const DUPLICATE_KEY = 11000
const { LOGIN, LOGOUT, SIGNUP, EMAIL_VERIFY, VERIFICATION_RESEND, PASSWORD_RESET_REQUEST, PASSWORD_RESET } = AUDIT_ACTIONS

/**
 * Authentication use cases. Controllers translate HTTP ⇄ these functions;
 * all security decisions live here.
 *
 * Anti-enumeration rules applied throughout:
 *  - signup, resend verification and password reset requests respond
 *    identically whether or not an account exists;
 *  - login returns one generic error for unknown email and wrong password,
 *    with equalized hashing work;
 *  - per-account rate-limit keys are fingerprints of the submitted email, so
 *    they apply equally to accounts that do not exist.
 */
export function createAuthService({ config, logger, mailer, audit, sessions }) {
  const accountKey = (prefix, email) => `${prefix}:acct:${fingerprint(config.authSecret, email)}`
  const ipKey = (prefix, ctx) => `${prefix}:ip:${ctx.ip ?? 'unknown'}`

  function serializeUser(user) {
    return {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
    }
  }

  /**
   * Session payload returned by login, GET /auth/session and organization switches.
   * `permissions` describe the current organization only; the UI uses them to
   * shape itself, and every action is still authorized again on the server.
   */
  async function describeSession(user, session) {
    const memberships = await listMembershipsForUser(user._id)
    const active =
      memberships.find((m) => String(m.organization._id) === String(session.activeOrganizationId)) ?? memberships[0]

    return {
      user: serializeUser(user),
      organization: active ? serializeOrganization(active.organization) : null,
      membership: active ? { role: active.membership.role, roleLabel: ROLE_LABELS[active.membership.role] } : null,
      permissions: active ? permissionsForRole(active.membership.role) : [],
      memberships: memberships.map((m) =>
        serializeMembership(m.membership, m.organization, { current: m === active }),
      ),
      session: { persistent: session.persistent, expiresAt: session.expiresAt },
    }
  }

  // ── Signup ────────────────────────────────────────────────────────────────

  async function signup({ fullName, email, password, workspace }, ctx) {
    await rateLimits.enforce(ipKey('signup', ctx), RATE_LIMITS.signupIp, 'client')

    const emailNormalized = normalizeEmail(email)
    const policyError = passwordPolicyError(password, { email: emailNormalized, fullName })
    if (policyError) throw errors.validation({ password: policyError })

    // Hash before checking existence so both paths do the same expensive work.
    const passwordHash = await hashPassword(password)
    const response = { email: emailNormalized, verificationRequired: true }

    // Starts the resend cooldown for both paths so follow-up behavior is identical too.
    await rateLimits.consume(
      accountKey('verification-resend-interval', emailNormalized),
      RATE_LIMITS.verificationResendAccountInterval,
    )

    const existing = await User.findOne({ emailNormalized }).lean()
    if (existing) {
      await notifyExistingAccount(existing, ctx)
      return response
    }

    let created
    try {
      created = await mongoose.connection.transaction(async (session) => {
        const [user] = await User.create(
          [{ fullName, email: email.trim(), emailNormalized, passwordHash }],
          { session },
        )
        const { organization } = await createOrganizationWithOwner({ name: workspace, userId: user._id }, { session })
        const { token } = await issueToken(user._id, TOKEN_PURPOSES.EMAIL_VERIFICATION, { session })
        return { user, organization, token }
      })
    } catch (error) {
      // Concurrent signup for the same email: treat exactly like an existing account.
      if (error?.code === DUPLICATE_KEY) {
        const winner = await User.findOne({ emailNormalized }).lean()
        if (winner) await notifyExistingAccount(winner, ctx)
        return response
      }
      throw error
    }

    const { user, organization, token } = created
    mailer.dispatch(emailTemplates.verification(config, { to: user.email, fullName: user.fullName, token }))
    await audit.record(ctx, {
      action: SIGNUP,
      outcome: 'success',
      userId: user._id,
      organizationId: organization._id,
    })
    return response
  }

  async function notifyExistingAccount(user, ctx) {
    const notice = await rateLimits.consume(accountKey('signup-existing', user.emailNormalized), {
      limit: 3,
      windowMs: 60 * 60 * 1000,
    })
    if (notice.allowed) {
      mailer.dispatch(emailTemplates.signupExistingAccount(config, { to: user.email, fullName: user.fullName }))
    }
    await audit.record(ctx, { action: SIGNUP, outcome: 'failure', userId: user._id, reason: 'email_in_use' })
  }

  // ── Login / logout / session ─────────────────────────────────────────────

  async function login({ email, password, remember }, ctx) {
    const emailNormalized = normalizeEmail(email)
    const failuresKey = accountKey('login-failures', emailNormalized)

    const ipWindow = await rateLimits.consume(ipKey('login', ctx), RATE_LIMITS.loginIp)
    if (!ipWindow.allowed) {
      await audit.record(ctx, { action: LOGIN, outcome: 'failure', email: emailNormalized, reason: 'ip_rate_limited' })
      throw errors.rateLimited(ipWindow.retryAfter, 'client')
    }

    const lock = await rateLimits.peek(failuresKey, RATE_LIMITS.loginAccountFailures)
    if (lock.blocked) {
      await audit.record(ctx, { action: LOGIN, outcome: 'failure', email: emailNormalized, reason: 'account_rate_limited' })
      throw errors.rateLimited(lock.retryAfter, 'account')
    }

    const user = await User.findOne({ emailNormalized }).select('+passwordHash')
    const passwordOk = user ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password)

    if (!user || !passwordOk || user.status !== 'active') {
      const failures = await rateLimits.consume(failuresKey, RATE_LIMITS.loginAccountFailures)
      await audit.record(ctx, {
        action: LOGIN,
        outcome: 'failure',
        userId: user?._id ?? null,
        email: emailNormalized,
        reason: !user ? 'unknown_account' : !passwordOk ? 'bad_password' : 'account_disabled',
      })
      // The attempt that reaches the limit already reports the lock, with its countdown.
      if (failures.count >= RATE_LIMITS.loginAccountFailures.limit) {
        throw errors.rateLimited(failures.retryAfter, 'account')
      }
      throw errors.invalidCredentials()
    }

    // Correct password: revealing verification status is acceptable at this point.
    if (!user.emailVerifiedAt) {
      await audit.record(ctx, { action: LOGIN, outcome: 'failure', userId: user._id, reason: 'email_not_verified' })
      throw errors.emailNotVerified()
    }

    await rateLimits.reset(failuresKey)
    const memberships = await listMembershipsForUser(user._id)
    const activeOrganizationId = memberships[0]?.organization._id ?? null

    // Always a fresh session id — never reuse one presented by the client (session fixation).
    if (ctx.presentedSessionToken) await sessions.revokeSession(ctx.presentedSessionToken)
    const { token, session } = await sessions.createSession({
      userId: user._id,
      persistent: Boolean(remember),
      activeOrganizationId,
      ctx,
    })
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } })
    await audit.record(ctx, { action: LOGIN, outcome: 'success', userId: user._id, organizationId: activeOrganizationId })

    return { token, session, payload: await describeSession(user, session) }
  }

  async function logout(auth, ctx) {
    if (ctx.presentedSessionToken) await sessions.revokeSession(ctx.presentedSessionToken)
    if (auth) await audit.record(ctx, { action: LOGOUT, outcome: 'success', userId: auth.user._id })
  }

  // ── Email verification ───────────────────────────────────────────────────

  async function verifyEmail({ token }, ctx) {
    await rateLimits.enforce(ipKey('token', ctx), RATE_LIMITS.tokenIp, 'client')
    let record
    try {
      record = await consumeToken(token, TOKEN_PURPOSES.EMAIL_VERIFICATION)
    } catch (error) {
      await audit.record(ctx, { action: EMAIL_VERIFY, outcome: 'failure', reason: error.code?.toLowerCase() })
      throw error
    }
    await User.updateOne({ _id: record.userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } })
    await invalidateTokens(record.userId, TOKEN_PURPOSES.EMAIL_VERIFICATION)
    await audit.record(ctx, { action: EMAIL_VERIFY, outcome: 'success', userId: record.userId })
    return { verified: true }
  }

  async function resendVerification({ email }, ctx) {
    const emailNormalized = normalizeEmail(email)
    await rateLimits.enforce(ipKey('verification-resend', ctx), RATE_LIMITS.verificationResendIp, 'client')
    await rateLimits.enforce(
      accountKey('verification-resend-interval', emailNormalized),
      RATE_LIMITS.verificationResendAccountInterval,
      'account',
    )
    await rateLimits.enforce(
      accountKey('verification-resend-hourly', emailNormalized),
      RATE_LIMITS.verificationResendAccountHourly,
      'account',
    )

    const user = await User.findOne({ emailNormalized, status: 'active' }).lean()
    if (user && !user.emailVerifiedAt) {
      const { token } = await issueToken(user._id, TOKEN_PURPOSES.EMAIL_VERIFICATION)
      mailer.dispatch(emailTemplates.verification(config, { to: user.email, fullName: user.fullName, token }))
      await audit.record(ctx, { action: VERIFICATION_RESEND, outcome: 'success', userId: user._id })
    }
    return { ok: true, cooldown: Math.ceil(RATE_LIMITS.verificationResendAccountInterval.windowMs / 1000) }
  }

  // ── Password recovery ────────────────────────────────────────────────────

  async function requestPasswordReset({ email }, ctx) {
    const emailNormalized = normalizeEmail(email)
    await rateLimits.enforce(ipKey('password-reset', ctx), RATE_LIMITS.passwordResetRequestIp, 'client')
    await rateLimits.enforce(
      accountKey('password-reset', emailNormalized),
      RATE_LIMITS.passwordResetRequestAccount,
      'account',
    )

    const user = await User.findOne({ emailNormalized, status: 'active' }).lean()
    if (user) {
      const { token } = await issueToken(user._id, TOKEN_PURPOSES.PASSWORD_RESET)
      mailer.dispatch(emailTemplates.passwordReset(config, { to: user.email, fullName: user.fullName, token }))
      await audit.record(ctx, { action: PASSWORD_RESET_REQUEST, outcome: 'success', userId: user._id })
    }
    return { ok: true }
  }

  async function validateResetToken({ token }, ctx) {
    await rateLimits.enforce(ipKey('token', ctx), RATE_LIMITS.tokenIp, 'client')
    await inspectToken(token, TOKEN_PURPOSES.PASSWORD_RESET)
    return { valid: true }
  }

  async function resetPassword({ token, password }, ctx) {
    await rateLimits.enforce(ipKey('token', ctx), RATE_LIMITS.tokenIp, 'client')

    // Check the link and the password policy before doing any irreversible work.
    const preview = await inspectToken(token, TOKEN_PURPOSES.PASSWORD_RESET)
    const user = await User.findById(preview.userId).lean()
    if (!user || user.status !== 'active') throw errors.tokenInvalid()

    const policyError = passwordPolicyError(password, { email: user.emailNormalized, fullName: user.fullName })
    if (policyError) throw errors.validation({ password: policyError })
    const passwordHash = await hashPassword(password)

    let revokedSessions = 0
    try {
      await mongoose.connection.transaction(async (session) => {
        const now = new Date()
        const record = await consumeToken(token, TOKEN_PURPOSES.PASSWORD_RESET, { session })
        await User.updateOne(
          { _id: record.userId },
          [
            {
              $set: {
                // $literal: PHC strings start with "$", which a pipeline would read as a field path.
                passwordHash: { $literal: passwordHash },
                passwordChangedAt: now,
                // Completing a reset proves control of the inbox.
                emailVerifiedAt: { $ifNull: ['$emailVerifiedAt', now] },
              },
            },
          ],
          { session, updatePipeline: true },
        )
        revokedSessions = await sessions.revokeAllSessions(record.userId, { session })
        await invalidateTokens(record.userId, TOKEN_PURPOSES.PASSWORD_RESET, { session })
      })
    } catch (error) {
      await audit.record(ctx, { action: PASSWORD_RESET, outcome: 'failure', userId: user._id, reason: error.code?.toLowerCase() })
      throw error
    }

    // Password is known now: clear any login lockout for this account.
    await rateLimits.reset(accountKey('login-failures', user.emailNormalized))
    mailer.dispatch(emailTemplates.passwordChanged(config, { to: user.email, fullName: user.fullName }))
    await audit.record(ctx, { action: PASSWORD_RESET, outcome: 'success', userId: user._id })
    logger.debug({ userId: String(user._id), revokedSessions }, 'Password reset completed')
    return { ok: true, sessionsRevoked: true }
  }

  return {
    signup,
    login,
    logout,
    describeSession,
    verifyEmail,
    resendVerification,
    requestPasswordReset,
    validateResetToken,
    resetPassword,
  }
}
