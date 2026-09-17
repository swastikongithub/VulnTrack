import { errors } from '../utils/errors.js'

function fieldErrors(issues, { nested = true } = {}) {
  const fields = {}
  for (const issue of issues) {
    // Nested paths join with dots ("identifiers.0.value") so forms can map them to rows.
    const path = nested ? issue.path : issue.path.slice(0, 1)
    const field = path.length ? path.join('.') : 'form'
    fields[field] ??= issue.message
  }
  return fields
}

/**
 * Parses req.body with a zod schema. Unknown keys are stripped, so only
 * declared primitive fields reach services and queries.
 * Error fields map to the web client's form field names.
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {})
    if (!result.success) return next(errors.validation(fieldErrors(result.error.issues)))
    req.body = result.data
    next()
  }
}

/**
 * Parses the query string into `req.validatedQuery` (Express 5 makes req.query
 * read-only). Unknown parameters are ignored; invalid ones are a 400.
 */
export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query ?? {})
    if (!result.success) return next(errors.validation(fieldErrors(result.error.issues, { nested: false }), 'Some filters are not valid.'))
    req.validatedQuery = result.data
    next()
  }
}
