/**
 * Client-side validation for auth forms. These rules give fast feedback only;
 * the backend will re-validate everything (never trust the client).
 *
 * Password policy follows NIST SP 800-63B: length over composition rules.
 */

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value) {
  const email = value.trim()
  if (!email) return 'Enter your work email'
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email, like name@company.com'
  return undefined
}

export function validateFullName(value) {
  const name = value.trim()
  if (!name) return 'Enter your full name'
  if (name.length < 2) return 'Name must be at least 2 characters'
  if (name.length > 80) return 'Name must be 80 characters or fewer'
  return undefined
}

export function validateWorkspace(value) {
  const name = value.trim()
  if (!name) return 'Name your workspace'
  if (name.length < 2) return 'Workspace name must be at least 2 characters'
  if (name.length > 60) return 'Workspace name must be 60 characters or fewer'
  return undefined
}

/** Login only checks presence — never reveal policy details at sign-in. */
export function validateLoginPassword(value) {
  if (!value) return 'Enter your password'
  return undefined
}

export function passwordChecks(password, { email = '', name = '' } = {}) {
  const lower = password.toLowerCase()
  const emailLocal = email.split('@')[0]?.toLowerCase() ?? ''
  const nameParts = name
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length >= 4)

  const containsPersonal =
    (emailLocal.length >= 4 && lower.includes(emailLocal)) || nameParts.some((part) => lower.includes(part))

  return {
    length: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
    personal: password.length > 0 && !containsPersonal,
    variety: [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length >= 3,
  }
}

export function validateNewPassword(value, context) {
  if (!value) return 'Create a password'
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`
  if (value.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer`
  if (!passwordChecks(value, context).personal) return "Don't include your name or email"
  return undefined
}

export function validateConfirmPassword(value, password) {
  if (!value) return 'Confirm your password'
  if (value !== password) return "Passwords don't match"
  return undefined
}

/**
 * Rough strength estimate (0–4) for the meter. Informational only —
 * the enforced rule is length + no personal info.
 */
export function estimateStrength(password, context) {
  if (!password) return 0
  const checks = passwordChecks(password, context)
  let score = 0
  if (password.length >= 8) score += 1
  if (checks.length) score += 1
  if (checks.variety) score += 1
  if (password.length >= 16) score += 1
  if (!checks.personal) score = Math.min(score, 1)
  if (/^(.)\1+$/.test(password) || /^(?:password|qwerty|123456)/i.test(password)) score = Math.min(score, 1)
  return Math.min(score, 4)
}
