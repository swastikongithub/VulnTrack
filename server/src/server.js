import { createApp } from './app.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { loadConfig } from './config/env.js'
import './models/index.js'
import { createEmailService } from './services/emailService.js'
import { createLogger } from './utils/logger.js'

async function main() {
  const config = loadConfig()
  const logger = createLogger(config.log)
  const mailer = createEmailService({ config, logger })

  if (config.email.transport === 'log') {
    logger.warn('EMAIL_TRANSPORT=log: verification and reset links are printed to this log (development only)')
  }

  await connectDatabase(config.mongoUri, logger)
  const app = createApp({ config, logger, mailer })
  const server = app.listen(config.port, () => logger.info({ port: config.port, env: config.env }, 'VulnTrack API listening'))

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down')
    server.close()
    await mailer.idle()
    await disconnectDatabase()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
