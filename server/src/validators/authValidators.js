import { z } from 'zod'
import { PASSWORD_POLICY } from '../config/security.js'

/**
 * Request schemas. Messages match the web client's field copy so server-side
 * validation errors render in the existing field message rows unchanged.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const email = z
  .string({ error: 'Enter your work email' })
  .trim()
  .min(1, 'Enter your work email')
  .max(254, 'Enter a valid email, like name@company.com')
  .regex(EMAIL_PATTERN, 'Enter a valid email, like name@company.com')

/** Presented token — shape is checked in the token service (maps to TOKEN_INVALID, not a form error). */
const token = z.string({ error: 'This link is not valid.' }).max(512, 'This link is not valid.')

export const signupSchema = z
  .object({
    fullName: z
      .string({ error: 'Enter your full name' })
      .trim()
      .min(1, 'Enter your full name')
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name must be 80 characters or fewer'),
    email,
    workspace: z
      .string({ error: 'Name your workspace' })
      .trim()
      .min(1, 'Name your workspace')
      .min(2, 'Workspace name must be at least 2 characters')
      .max(60, 'Workspace name must be 60 characters or fewer'),
    password: z
      .string({ error: 'Create a password' })
      .min(1, 'Create a password')
      .max(PASSWORD_POLICY.maxLength, `Use ${PASSWORD_POLICY.maxLength} characters or fewer`),
    confirmPassword: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.confirmPassword !== undefined && value.confirmPassword !== value.password) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: "Passwords don't match" })
    }
  })

export const loginSchema = z.object({
  email,
  // Length cap only: login must not disclose the password policy, and must not hash unbounded input.
  password: z
    .string({ error: 'Enter your password' })
    .min(1, 'Enter your password')
    .max(PASSWORD_POLICY.maxLength, 'Email or password is incorrect.'),
  remember: z.boolean().optional().default(false),
})

export const emailOnlySchema = z.object({ email })

export const tokenSchema = z.object({ token })

export const resetPasswordSchema = z
  .object({
    token,
    password: z
      .string({ error: 'Create a password' })
      .min(1, 'Create a password')
      .max(PASSWORD_POLICY.maxLength, `Use ${PASSWORD_POLICY.maxLength} characters or fewer`),
    confirmPassword: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.confirmPassword !== undefined && value.confirmPassword !== value.password) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: "Passwords don't match" })
    }
  })
