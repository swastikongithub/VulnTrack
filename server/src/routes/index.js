import { Router } from 'express'
import mongoose from 'mongoose'
import { createAssetController } from '../controllers/assetController.js'
import { createAuthController } from '../controllers/authController.js'
import { createOrganizationController } from '../controllers/organizationController.js'
import { requireAuth } from '../middleware/authenticate.js'
import { createAuthorization } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'
import {
  emailOnlySchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  tokenSchema,
} from '../validators/authValidators.js'
import { registerAssetRoutes } from './assetRoutes.js'
import { registerOrganizationRoutes } from './organizationRoutes.js'

export function createRoutes({ config, auth, sessions, audit, organizations, members, invitations, assets }) {
  const router = Router()
  const authController = createAuthController({ config, auth, sessions })
  const organizationController = createOrganizationController({ auth, organizations, members, invitations })
  const assetController = createAssetController({ assets })
  const authorization = createAuthorization({ audit })

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

  // ── Organizations, members, invitations ──
  registerOrganizationRoutes(router, { controller: organizationController, authorization })

  // ── Asset inventory ──
  registerAssetRoutes(router, { controller: assetController, authorization })

  return router
}
