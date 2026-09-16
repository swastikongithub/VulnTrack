import { Router } from 'express'
import mongoose from 'mongoose'
import { PERMISSIONS } from '../config/roles.js'
import { createAuthController } from '../controllers/authController.js'
import { organizationController } from '../controllers/organizationController.js'
import { requireAuth } from '../middleware/authenticate.js'
import { requireMembership, requirePermission } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'
import {
  emailOnlySchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  tokenSchema,
} from '../validators/authValidators.js'

export function createRoutes({ config, auth, sessions }) {
  const router = Router()
  const authController = createAuthController({ config, auth, sessions })

  router.get('/health', (_req, res) => {
    const database = mongoose.connection.readyState === 1 ? 'up' : 'down'
    res.status(database === 'up' ? 200 : 503).json({ status: database === 'up' ? 'ok' : 'degraded', database })
  })

  // ── Authentication ──
  router.post('/auth/signup', validateBody(signupSchema), authController.signup)
  router.post('/auth/login', validateBody(loginSchema), authController.login)
  router.post('/auth/logout', authController.logout)
  router.get('/auth/session', requireAuth, authController.session)
  router.post('/auth/email/verify', validateBody(tokenSchema), authController.verifyEmail)
  router.post('/auth/email/resend', validateBody(emailOnlySchema), authController.resendVerification)
  router.post('/auth/password/forgot', validateBody(emailOnlySchema), authController.forgotPassword)
  router.post('/auth/password/reset/validate', validateBody(tokenSchema), authController.validateResetToken)
  router.post('/auth/password/reset', validateBody(resetPasswordSchema), authController.resetPassword)

  // ── Tenancy foundation ──
  router.get('/organizations', requireAuth, organizationController.listMine)
  router.get('/organizations/:organizationId', requireAuth, requireMembership(), organizationController.getOne)
  router.get(
    '/organizations/:organizationId/members',
    requireAuth,
    requireMembership(),
    requirePermission(PERMISSIONS.MEMBERS_READ),
    organizationController.listMembers,
  )

  return router
}
