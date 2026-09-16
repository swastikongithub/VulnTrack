import nodemailer from 'nodemailer'

/**
 * Transactional email. The provider is deliberately undecided (master plan
 * §57), so delivery goes through SMTP, which every provider supports.
 *
 * Transports:
 *  - smtp:   real delivery (production; Mailpit locally)
 *  - log:    development only — prints the message, including its link, to the server log
 *  - memory: tests only — keeps messages in an in-process outbox
 *
 * `dispatch` is fire-and-forget so response timing never depends on whether an
 * email was sent (which would reveal whether an account exists). A durable
 * queue (BullMQ) replaces this when background jobs are introduced.
 */
export function createEmailService({ config, logger }) {
  const { transport: kind, from, smtp } = config.email
  const outbox = []
  const pending = new Set()

  const transporter =
    kind === 'smtp'
      ? nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
        })
      : null

  async function send(message) {
    const mail = { from, ...message }
    if (kind === 'memory') {
      outbox.push(mail)
      return
    }
    if (kind === 'log') {
      logger.info({ to: mail.to, subject: mail.subject }, `[dev email]\n${mail.text}`)
      return
    }
    await transporter.sendMail(mail)
  }

  function dispatch(message) {
    const job = send(message)
      .catch((error) => logger.error({ err: error, subject: message.subject }, 'Email delivery failed'))
      .finally(() => pending.delete(job))
    pending.add(job)
  }

  /** Resolves once in-flight dispatches finish (tests, graceful shutdown). */
  async function idle() {
    while (pending.size > 0) await Promise.all([...pending])
  }

  return { send, dispatch, idle, outbox }
}

const link = (config, path, token) => `${config.appOrigin}${path}?token=${encodeURIComponent(token)}`

const footer = '\n\n— VulnTrack\nIf you did not expect this email, you can safely ignore it.'

export const emailTemplates = {
  verification(config, { to, fullName, token }) {
    const url = link(config, '/verify-email', token)
    return {
      to,
      subject: 'Verify your email for VulnTrack',
      text: `Hi ${fullName},\n\nConfirm your email address to activate your VulnTrack account:\n\n${url}\n\nThis link expires in 24 hours and can be used once.${footer}`,
    }
  },

  passwordReset(config, { to, fullName, token }) {
    const url = link(config, '/reset-password', token)
    return {
      to,
      subject: 'Reset your VulnTrack password',
      text: `Hi ${fullName},\n\nWe received a request to reset your password. Choose a new one here:\n\n${url}\n\nThis link expires in 30 minutes and can be used once. If you didn't request this, your password has not changed.${footer}`,
    }
  },

  passwordChanged(config, { to, fullName }) {
    return {
      to,
      subject: 'Your VulnTrack password was changed',
      text: `Hi ${fullName},\n\nYour VulnTrack password was just changed and all active sessions were signed out.\n\nIf this wasn't you, reset your password immediately at ${config.appOrigin}/forgot-password.${footer}`,
    }
  },

  signupExistingAccount(config, { to, fullName }) {
    return {
      to,
      subject: 'Someone tried to create a VulnTrack account with your email',
      text: `Hi ${fullName},\n\nSomeone tried to create a new VulnTrack account using this email address, which already has an account.\n\nIf it was you, sign in at ${config.appOrigin}/login or reset your password at ${config.appOrigin}/forgot-password.${footer}`,
    }
  },
}
