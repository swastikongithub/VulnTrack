/**
 * HTTP adapters for the software inventory. Handlers work on the organization
 * and membership resolved by the authorize middleware; no business rules here.
 */
export function createSoftwareController({ software }) {
  const context = (req) => ({ organization: req.organization, membership: req.membership })

  return {
    async list(req, res) {
      res.json(await software.list(context(req), req.validatedQuery))
    },

    async summary(req, res) {
      res.json(await software.summary(context(req)))
    },

    async get(req, res) {
      res.json({ component: await software.get(context(req), req.params.componentId) })
    },

    async create(req, res) {
      const component = await software.create(context(req), req.params.assetId, req.body, req.auth, req.ctx)
      res.status(201).json({ component })
    },

    async update(req, res) {
      res.json({ component: await software.update(context(req), req.params.componentId, req.body, req.auth, req.ctx) })
    },

    async remove(req, res) {
      res.json(await software.remove(context(req), req.params.componentId, req.auth, req.ctx))
    },
  }
}
