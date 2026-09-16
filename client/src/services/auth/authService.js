import * as apiAuth from './apiAuthService'
import * as mockAuth from './mockAuthService'

/**
 * Auth service facade used by the UI.
 *
 * The real API is the default and the only implementation in production
 * builds. `VITE_AUTH_MODE=mock` (development only) swaps in the deterministic
 * mock so every visual state can be previewed without a backend.
 */
export const AUTH_MODE = import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : 'api'

const impl = AUTH_MODE === 'mock' ? mockAuth : apiAuth

export { AUTH_ERROR, AuthError, describeAuthError } from './authErrors'

export const login = (input) => impl.login(input)
export const signup = (input) => impl.signup(input)
export const logout = () => impl.logout()
export const getSession = () => impl.getSession()
export const requestPasswordReset = (input) => impl.requestPasswordReset(input)
export const checkResetToken = (input) => impl.checkResetToken(input)
export const resetPassword = (input) => impl.resetPassword(input)
export const verifyEmail = (input) => impl.verifyEmail(input)
export const resendVerification = (input) => impl.resendVerification(input)
