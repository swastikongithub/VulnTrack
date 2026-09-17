/**
 * HTTP adapters for the asset inventory. Handlers work on the organization and
 * membership resolved by the authorize middleware; no business rules here.
 */
export function createAssetController({ assets }) {
  const context = (req) => ({ organization: req.organization, membership: req.membership })

  return {
    async list(req, res) {
      res.json(await assets.list(context(req), req.validatedQuery))
    },

    async summary(req, res) {
      res.json(await assets.summary(context(req)))
    },

    async get(req, res) {
      res.json({ asset: await assets.get(context(req), req.params.assetId) })
    },

    async create(req, res) {
      const asset = await assets.create(context(req), req.body, req.auth, req.ctx)
      res.status(201).json({ asset })
    },

    async update(req, res) {
      res.json({ asset: await assets.update(context(req), req.params.assetId, req.body, req.auth, req.ctx) })
    },

    async archive(req, res) {
      res.json({ asset: await assets.archive(context(req), req.params.assetId, req.body, req.auth, req.ctx) })
    },

    async restore(req, res) {
      res.json({ asset: await assets.restore(context(req), req.params.assetId, req.body, req.auth, req.ctx) })
    },

    async remove(req, res) {
      res.json(await assets.remove(context(req), req.params.assetId, req.auth, req.ctx))
    },
  }
}
