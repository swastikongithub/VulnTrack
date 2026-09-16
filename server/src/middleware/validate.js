import { errors } from '../utils/errors.js'

/**
 * Parses req.body with a zod schema. Unknown keys are stripped, so only
 * declared primitive fields reach services and queries.
 * Error fields map to the web client's form field names.
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {})
    if (!result.success) {
      const fields = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] ?? 'form'
        fields[field] ??= issue.message
      }
      return next(errors.validation(fields))
    }
    req.body = result.data
    next()
  }
}
