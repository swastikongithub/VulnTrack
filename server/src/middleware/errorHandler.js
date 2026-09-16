import { AppError, ERROR_CODES } from '../utils/errors.js'

/**
 * Converts every error into the structured shape the web client maps:
 *   { error: { code, message, fields?, retryAfter?, scope?, requestId } }
 * Unexpected errors are logged in full but reported generically.
 */
export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, _next) => {
    let appError = error

    if (!(error instanceof AppError)) {
      if (error?.type === 'entity.parse.failed') {
        appError = new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Malformed JSON body.')
      } else if (error?.type === 'entity.too.large') {
        appError = new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'Request body is too large.')
      } else {
        logger.error({ err: error, requestId: req.id, path: req.path }, 'Unhandled error')
        appError = new AppError(500, ERROR_CODES.SERVER, 'Something went wrong. Please try again.')
      }
    }

    const { status, code, message, details } = appError
    if (details?.retryAfter) res.set('Retry-After', String(details.retryAfter))

    res.status(status).json({
      error: {
        code,
        message,
        ...(details?.fields ? { fields: details.fields } : {}),
        ...(details?.retryAfter ? { retryAfter: details.retryAfter } : {}),
        ...(details?.scope ? { scope: details.scope } : {}),
        requestId: req.id,
      },
    })
  }
}

export function notFound(_req, _res, next) {
  next(new AppError(404, ERROR_CODES.NOT_FOUND, 'Not found.'))
}
