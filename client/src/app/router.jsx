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
    // Public marketing page; its own chunk so the auth and app bundles don't carry it.
    path: '/',
    hydrateFallbackElement: <RouteLoading />,
    lazy: async () => ({ Component: (await import('@/features/marketing/pages/LandingPage')).LandingPage }),
  },
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
      { index: true, element: <Navigate to="/organization/assets" replace /> },
      { path: 'assets', lazy: async () => ({ Component: (await import('@/features/assets/pages/AssetInventoryPage')).AssetInventoryPage }) },
      {
        path: 'assets/new',
        lazy: async () => {
          const { AssetFormPage } = await import('@/features/assets/pages/AssetFormPage')
          return { Component: () => <AssetFormPage mode="create" /> }
        },
      },
      { path: 'assets/:assetId', lazy: async () => ({ Component: (await import('@/features/assets/pages/AssetDetailPage')).AssetDetailPage }) },
      {
        path: 'assets/:assetId/edit',
        lazy: async () => {
          const { AssetFormPage } = await import('@/features/assets/pages/AssetFormPage')
          return { Component: () => <AssetFormPage mode="edit" /> }
        },
      },
      { path: 'software', lazy: async () => ({ Component: (await import('@/features/software/pages/SoftwareInventoryPage')).SoftwareInventoryPage }) },
      {
        path: 'vulnerabilities',
        lazy: async () => ({ Component: (await import('@/features/vulnerabilities/pages/VulnerabilityCatalogPage')).VulnerabilityCatalogPage }),
      },
      {
        path: 'vulnerabilities/:source/:sourceId',
        lazy: async () => ({ Component: (await import('@/features/vulnerabilities/pages/VulnerabilityDetailPage')).VulnerabilityDetailPage }),
      },
      { path: 'members', lazy: async () => ({ Component: (await import('@/features/organization/pages/MembersPage')).MembersPage }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('@/features/organization/pages/SettingsPage')).SettingsPage }) },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
