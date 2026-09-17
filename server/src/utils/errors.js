/**
 * API error codes. The web client maps these to its existing UI states, so
 * codes are a stable contract — add new ones, never repurpose existing ones.
 */
export const ERROR_CODES = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  CSRF_REJECTED: 'CSRF_REJECTED',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  INVITATION_EXISTS: 'INVITATION_EXISTS',
  INVITATION_EMAIL_MISMATCH: 'INVITATION_EMAIL_MISMATCH',
  LAST_OWNER: 'LAST_OWNER',
  SERVER: 'SERVER',
})

export class AppError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code  one of ERROR_CODES
   * @param {string} message safe, user-facing message (never internal details)
   * @param {object} [details] extra safe fields: { fields, retryAfter, scope }
   */
  constructor(status, code, message, details = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const errors = {
  validation: (fields, message = 'Some fields need attention.') =>
    new AppError(400, ERROR_CODES.VALIDATION_FAILED, message, { fields }),
  invalidCredentials: () => new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Email or password is incorrect.'),
  emailNotVerified: () => new AppError(403, ERROR_CODES.EMAIL_NOT_VERIFIED, 'Verify your email to continue.'),
  unauthenticated: () => new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Sign in to continue.'),
  forbidden: (message = 'You do not have access to this resource.') => new AppError(403, ERROR_CODES.FORBIDDEN, message),
  notFound: (message = 'Not found.') => new AppError(404, ERROR_CODES.NOT_FOUND, message),
  rateLimited: (retryAfter, scope) =>
    new AppError(429, ERROR_CODES.RATE_LIMITED, 'Too many requests. Try again later.', { retryAfter, scope }),
  tokenExpired: () => new AppError(410, ERROR_CODES.TOKEN_EXPIRED, 'This link has expired.'),
  tokenInvalid: () => new AppError(400, ERROR_CODES.TOKEN_INVALID, 'This link is not valid.'),
  csrf: () => new AppError(403, ERROR_CODES.CSRF_REJECTED, 'Request origin not allowed.'),
  alreadyMember: () => new AppError(409, ERROR_CODES.ALREADY_MEMBER, 'This person is already a member of the organization.'),
  invitationExists: () =>
    new AppError(409, ERROR_CODES.INVITATION_EXISTS, 'A pending invitation already exists for this email.'),
  invitationEmailMismatch: () =>
    new AppError(403, ERROR_CODES.INVITATION_EMAIL_MISMATCH, 'This invitation was sent to a different email address.'),
  lastOwner: () =>
    new AppError(409, ERROR_CODES.LAST_OWNER, 'An organization must keep at least one owner.'),
}
