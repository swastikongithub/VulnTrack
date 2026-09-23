/**
 * HTTP adapters for vulnerability matches. Handlers work on the organization
 * and membership resolved by the authorize middleware; no business rules here.
 */
export function createMatchController({ matches }) {
  const context = (req) => ({ organization: req.organization, membership: req.membership })

  return {
    async list(req, res) {
      res.json(await matches.list(context(req), req.validatedQuery))
    },

    async summary(req, res) {
      res.json(await matches.summary(context(req)))
    },

    async get(req, res) {
      res.json({ match: await matches.get(context(req), req.params.matchId) })
    },

    async recalculate(req, res) {
      res.status(202).json(await matches.recalculate(context(req), req.auth, req.ctx))
    },
  }
}
