import { createBrowserRouter, Navigate } from 'react-router'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { SessionReadyPage } from '@/features/auth/pages/SessionReadyPage'
import { SignupPage } from '@/features/auth/pages/SignupPage'
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage'
import { InvitationPage } from '@/features/organization/pages/InvitationPage'
import { RouteLoading } from './RouteLoading'

/**
 * Routes. All auth screens (and the invitation link) share AuthLayout so the
 * artwork persists across navigation. The organization area has its own shell;
 * the wider product application (/app/*) arrives in a later phase.
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
      { path: '/invite', element: <InvitationPage /> },
    ],
  },
  {
    // Loaded on demand so the sign-in screens don't carry the organization console.
    path: '/organization',
    hydrateFallbackElement: <RouteLoading />,
    lazy: async () => ({ Component: (await import('@/features/organization/components/OrganizationLayout')).OrganizationLayout }),
    children: [
      { index: true, element: <Navigate to="/organization/members" replace /> },
      { path: 'members', lazy: async () => ({ Component: (await import('@/features/organization/pages/MembersPage')).MembersPage }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('@/features/organization/pages/SettingsPage')).SettingsPage }) },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
])
