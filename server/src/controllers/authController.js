/**
 * HTTP adapters for the auth service: read validated input, call the use case,
 * manage the session cookie, shape the response. No business rules here.
 */
export function createAuthController({ config, auth, sessions }) {
  const cookieName = config.cookie.name

  return {
    async signup(req, res) {
      const result = await auth.signup(req.body, req.ctx)
      // 202 in every case: the account may or may not have been created (anti-enumeration).
      res.status(202).json(result)
    },

    async login(req, res) {
      const { token, session, payload } = await auth.login(req.body, req.ctx)
      res.cookie(cookieName, token, sessions.cookieOptions(session))
      res.status(200).json(payload)
    },

    async logout(req, res) {
      await auth.logout(req.auth, req.ctx)
      res.clearCookie(cookieName, sessions.clearCookieOptions())
      res.status(200).json({ ok: true })
    },

    async session(req, res) {
      res.status(200).json(await auth.describeSession(req.auth.user, req.auth.session))
    },

    async verifyEmail(req, res) {
      res.status(200).json(await auth.verifyEmail(req.body, req.ctx))
    },

    async resendVerification(req, res) {
      res.status(202).json(await auth.resendVerification(req.body, req.ctx))
    },

    async forgotPassword(req, res) {
      res.status(202).json(await auth.requestPasswordReset(req.body, req.ctx))
    },

    async validateResetToken(req, res) {
      res.status(200).json(await auth.validateResetToken(req.body, req.ctx))
    },

    async resetPassword(req, res) {
      const result = await auth.resetPassword(req.body, req.ctx)
      // This browser may hold a now-revoked session cookie.
      res.clearCookie(cookieName, sessions.clearCookieOptions())
      res.status(200).json(result)
    },
  }
}
