import { createBrowserRouter, Navigate } from 'react-router'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { SessionReadyPage } from '@/features/auth/pages/SessionReadyPage'
import { SignupPage } from '@/features/auth/pages/SignupPage'
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage'

/**
 * Routes. All auth screens share AuthLayout so the artwork persists across
 * navigation. The product application (/app/*) is added in a later phase.
 */
export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/session', element: <SessionReadyPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
])
