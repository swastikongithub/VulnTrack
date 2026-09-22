import { randomUUID } from 'node:crypto'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { REQUEST_BODY_LIMIT } from './config/security.js'
import { loadSession } from './middleware/authenticate.js'
import { originGuard, requireJsonBody } from './middleware/csrf.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { noStore, requestContext } from './middleware/requestContext.js'
import { createRoutes } from './routes/index.js'
import { createAssetService } from './services/assetService.js'
import { createAuditService } from './services/auditService.js'
import { createAuthService } from './services/authService.js'
import { createInvitationService } from './services/invitationService.js'
import { createMemberService } from './services/memberService.js'
import { createOrganizationService } from './services/organizationService.js'
import { createSessionService } from './services/sessionService.js'
import { createSoftwareService } from './services/softwareService.js'

/**
 * Builds the Express application. Dependencies are injected so tests can
 * supply their own config, logger and mailer.
 */
export function createApp({ config, logger, mailer }) {
  const sessions = createSessionService({ config })
  const audit = createAuditService({ config, logger })
  const auth = createAuthService({ config, logger, mailer, audit, sessions })
  const organizations = createOrganizationService({ audit })
  const members = createMemberService({ audit })
  const invitations = createInvitationService({ config, mailer, audit })
  const assets = createAssetService({ audit })
  const software = createSoftwareService({ audit })

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)
  app.set('query parser', 'simple')

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID()
        res.setHeader('X-Request-Id', id)
        return id
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'info' : 'debug'),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  )

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }))
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  )
  app.use(cookieParser())
  app.use(express.json({ limit: REQUEST_BODY_LIMIT, strict: true, type: 'application/json' }))
  app.use(requestContext(config))

  app.use(
    '/api',
    noStore,
    originGuard(config),
    requireJsonBody,
    loadSession({ config, sessions }),
    createRoutes({ config, auth, sessions, audit, organizations, members, invitations, assets, software }),
  )

  app.use(notFound)
  app.use(errorHandler(logger))

  return app
}
