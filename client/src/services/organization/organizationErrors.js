import { AUTH_ERROR } from '../auth/authErrors'

/** Codes added by the organization API (server/src/utils/errors.js). */
export const ORG_ERROR = {
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  INVITATION_EXISTS: 'INVITATION_EXISTS',
  INVITATION_EMAIL_MISMATCH: 'INVITATION_EMAIL_MISMATCH',
  LAST_OWNER: 'LAST_OWNER',
  NOT_FOUND: 'NOT_FOUND',
}

function formatWait(seconds) {
  if (!seconds) return 'shortly'
  if (seconds < 90) return `in ${Math.max(1, seconds)} seconds`
  return `in about ${Math.ceil(seconds / 60)} minutes`
}

/**
 * Copy for organization-area failures. `action` names what was attempted
 * ("change this role"), so messages stay specific without leaking internals.
 */
export function describeOrganizationError(error, action = 'complete this action') {
  if (error && !error.code && import.meta.env.DEV) console.error('[organization] unexpected client error', error)
  switch (error?.code) {
    case AUTH_ERROR.FORBIDDEN:
      return {
        title: `You can't ${action}`,
        body: error.message && !/do not have access/i.test(error.message) ? error.message : 'Your role doesn’t allow it. Ask an owner or admin.',
      }
    case ORG_ERROR.LAST_OWNER:
      return { title: 'An owner is required', body: 'Every organization keeps at least one owner. Appoint another owner first.' }
    case ORG_ERROR.NOT_FOUND:
      return { title: 'That no longer exists', body: 'It may have been changed by someone else. The list has been refreshed.' }
    case ORG_ERROR.ALREADY_MEMBER:
      return { title: 'Already a member', body: 'This person already belongs to the organization.' }
    case ORG_ERROR.INVITATION_EXISTS:
      return { title: 'Invitation already pending', body: 'Resend the existing invitation instead.' }
    case AUTH_ERROR.RATE_LIMITED:
      return { title: 'Slow down a little', body: `Too many requests. Try again ${formatWait(error.meta?.retryAfter)}.` }
    case AUTH_ERROR.NETWORK:
      return { title: "Can't reach VulnTrack", body: 'Check your connection and try again. Nothing was changed.' }
    case AUTH_ERROR.VALIDATION:
      return { title: 'Some details need attention', body: 'Review the highlighted fields and try again.' }
    default:
      return { title: 'Something went wrong on our side', body: 'Nothing was changed. Please try again in a moment.' }
  }
}
