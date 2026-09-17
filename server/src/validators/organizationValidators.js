import { z } from 'zod'
import { ROLE_VALUES } from '../config/roles.js'

/**
 * Organization / RBAC request schemas. Objects are parsed with zod's default
 * behavior (unknown keys stripped), so fields like `slug`, `organizationId`,
 * `userId` or `permissions` in a body can never reach a service.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const role = z.enum(ROLE_VALUES, { error: 'Choose a role' })

export const updateOrganizationSchema = z.object({
  name: z
    .string({ error: 'Name your workspace' })
    .trim()
    .min(1, 'Name your workspace')
    .min(2, 'Workspace name must be at least 2 characters')
    .max(60, 'Workspace name must be 60 characters or fewer'),
})

export const updateMemberRoleSchema = z.object({ role })

export const createInvitationSchema = z.object({
  email: z
    .string({ error: 'Enter an email address' })
    .trim()
    .min(1, 'Enter an email address')
    .max(254, 'Enter a valid email, like name@company.com')
    .regex(EMAIL_PATTERN, 'Enter a valid email, like name@company.com'),
  role,
})

export const switchOrganizationSchema = z.object({
  organizationId: z.string({ error: 'Choose an organization' }).max(64, 'Choose an organization'),
})

export const invitationTokenSchema = z.object({
  token: z.string({ error: 'This link is not valid.' }).max(512, 'This link is not valid.'),
})
