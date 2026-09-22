import { AnimatePresence, motion } from 'framer-motion'
import { Boxes, Layers, LogOut, Settings2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, NavLink, ScrollRestoration, useLocation, useNavigate, useOutlet } from 'react-router'
import { Alert, Button, IconButton, Logo, Spinner } from '@/design-system/components'
import { duration, ease, spring, travel } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'
import { sessionActions, useSessionStore } from '@/features/auth/sessionStore'
import { logout } from '@/services/auth/authService'
import { getCurrentOrganization } from '@/services/organization/organizationApi'
import { describeOrganizationError } from '@/services/organization/organizationErrors'
import { useApiResource } from '../hooks/useApiResource'
import { OrganizationContext } from '../organizationContext'
import { OrganizationSwitcher } from './OrganizationSwitcher'
import { PerimeterMotif } from './PerimeterMotif'

const NAV = [
  { to: '/organization/assets', label: 'Assets', icon: Boxes },
  { to: '/organization/software', label: 'Software', icon: Layers },
  { to: '/organization/members', label: 'Members', icon: Users },
  { to: '/organization/settings', label: 'Settings', icon: Settings2 },
]

/**
 * Shell for the organization area. Waits for the server session, then loads
 * the current organization and shares it with the pages. Route guards here are
 * a convenience only; the API enforces every permission.
 */
export function OrganizationLayout() {
  const status = useSessionStore((s) => s.status)
  const session = useSessionStore((s) => s.session)
  const location = useLocation()

  if (status === 'unknown') return <FullScreenStatus label="Loading your workspace" />
  if (status !== 'authenticated' || !session) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <OrganizationShell session={session} />
}

function OrganizationShell({ session }) {
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutlet()
  const organizationId = session.organization?.id ?? null
  const [announcement, setAnnouncement] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(null)

  const details = useApiResource(getCurrentOrganization, organizationId ?? 'none')
  const context = useMemo(
    () => ({ details: details.data, status: details.status, error: details.error, reload: details.reload }),
    [details.data, details.status, details.error, details.reload],
  )

  // The server may resolve a different current organization than this session snapshot
  // (e.g. membership removed elsewhere): re-sync the session so header and pages agree.
  const resolvedId = details.data?.organization.id
  const detailsMissing = details.status === 'error' && details.error?.code === 'NOT_FOUND'
  useEffect(() => {
    if ((resolvedId && resolvedId !== organizationId) || detailsMissing) sessionActions.refresh()
  }, [resolvedId, organizationId, detailsMissing])

  useEffect(() => {
    const page = NAV.find((item) => location.pathname.startsWith(item.to))?.label ?? 'Organization'
    document.title = `${page}${session.organization ? ` · ${session.organization.name}` : ''} · VulnTrack`
  }, [location.pathname, session.organization])

  const signOut = async () => {
    setSigningOut(true)
    setSignOutError(null)
    try {
      await logout()
      sessionActions.clear()
      navigate('/login', { replace: true })
    } catch (error) {
      setSignOutError(error)
      setSigningOut(false)
    }
  }

  return (
    <OrganizationContext.Provider value={context}>
      {/* New pages start at the top; back/forward restore the previous position. Filter changes (search params) keep it. */}
      <ScrollRestoration getKey={(location) => location.pathname} />
      <a
        href="#organization-content"
        className="sr-only-focusable fixed left-4 top-4 z-[var(--z-skiplink)] rounded-md bg-ion px-4 py-2 text-label text-on-ion"
      >
        Skip to content
      </a>

      {/* Atmosphere: a quiet, static echo of the Perimeter artwork. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[var(--z-scene)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_85%_-10%,rgb(124_220_255/0.07),transparent_70%),radial-gradient(ellipse_60%_50%_at_0%_110%,rgb(40_60_110/0.28),transparent_70%)]" />
        <PerimeterMotif className="absolute -right-40 -top-56 w-[46rem] opacity-[0.55] max-md:-right-64 max-md:-top-72" />
        <div className="grain absolute inset-0" />
      </div>

      <div className="relative z-[var(--z-content)] flex min-h-dvh flex-col">
        <header className="sticky top-0 z-[var(--z-sticky)] border-b border-line-subtle bg-ink-950/90 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-16 max-w-[80rem] items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-10">
            <Link
              to="/session"
              aria-label="VulnTrack — session overview"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ion"
            >
              <Logo size={26} className="max-sm:[&>span:last-child]:hidden" />
            </Link>
            <span aria-hidden="true" className="h-6 w-px shrink-0 bg-line" />
            <OrganizationSwitcher
              onSwitched={(next) => setAnnouncement(`Switched to ${next.organization?.name}. You are ${next.membership?.roleLabel}.`)}
            />
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
              <div className="hidden min-w-0 text-right md:block">
                <p className="max-w-[14rem] truncate text-label text-fg">{session.user.fullName}</p>
                <p className="max-w-[14rem] truncate text-caption text-fg-subtle">{session.user.email}</p>
              </div>
              <IconButton label={signingOut ? 'Signing out' : 'Sign out'} onClick={signOut} aria-busy={signingOut || undefined}>
                {signingOut ? <Spinner size={17} /> : <LogOut size={17} strokeWidth={1.75} />}
              </IconButton>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[80rem] flex-1 flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:flex-row lg:gap-10 lg:px-10 lg:pt-10">
          <OrganizationNav />

          <main id="organization-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
            <AnimatePresence initial={false}>
              {signOutError && (
                <Alert key="signout" tone="danger" title="We couldn't sign you out" className="mb-6">
                  {describeOrganizationError(signOutError).body} You are still signed in.
                </Alert>
              )}
            </AnimatePresence>

            {!organizationId ? (
              <NoOrganization />
            ) : details.status === 'error' && !details.data ? (
              <LoadError error={details.error} onRetry={() => details.reload()} />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${organizationId}:${location.pathname}`}
                  initial={{ opacity: 0, y: travel.element, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: duration.slow, ease: ease.enter } }}
                  exit={{ opacity: 0, y: -travel.micro, transition: { duration: duration.fast, ease: ease.exit } }}
                >
                  {outlet}
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>

        <footer className="border-t border-line-subtle">
          <div className="mx-auto flex max-w-[80rem] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-5 text-caption text-fg-subtle sm:px-6 lg:px-10">
            <p>© {new Date().getFullYear()} VulnTrack</p>
            <p>Access is checked by the server on every request.</p>
          </div>
        </footer>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </OrganizationContext.Provider>
  )
}

function OrganizationNav() {
  return (
    <nav aria-label="Organization" className="lg:w-56 lg:shrink-0">
      <p className="eyebrow mb-3 hidden items-center gap-2.5 text-fg-subtle lg:flex" aria-hidden="true">
        <span className="h-px w-5 bg-current opacity-70" />
        Workspace
      </p>
      <ul className="relative grid grid-cols-3 gap-1 rounded-md bg-ink-900/80 p-1 ring-1 ring-inset ring-line lg:sticky lg:top-24 lg:grid-cols-1 lg:bg-transparent lg:p-0 lg:ring-0">
        {NAV.map((item) => (
          <li key={item.to} className="relative">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative flex h-11 items-center justify-center gap-2.5 rounded-[7px] px-3 text-label transition-colors duration-[var(--duration-fast)] lg:justify-start',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ion',
                  isActive ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="organization-nav-indicator"
                      transition={spring.layout}
                      className="absolute inset-0 rounded-[7px] bg-surface-hover shadow-e1 ring-1 ring-inset ring-line-strong"
                    >
                      <span className="absolute inset-y-2.5 left-0 hidden w-[2px] rounded-full bg-ion lg:block" />
                    </motion.span>
                  )}
                  <item.icon aria-hidden="true" size={16} className={cn('relative', isActive && 'text-ion')} />
                  <span className="relative">{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function FullScreenStatus({ label }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950" role="status">
      <span className="flex items-center gap-3 text-label text-fg-muted">
        <Spinner size={18} className="text-ion" />
        {label}
      </span>
    </div>
  )
}

function LoadError({ error, onRetry }) {
  const copy = describeOrganizationError(error, 'load this organization')
  return (
    <div className="max-w-xl">
      <Alert tone="danger" title={copy.title} action={<Button variant="secondary" size="md" onClick={onRetry}>Try again</Button>}>
        {copy.body}
      </Alert>
    </div>
  )
}

function NoOrganization() {
  return (
    <div className="max-w-xl rounded-xl bg-surface p-6 ring-1 ring-line">
      <p className="eyebrow mb-3 flex items-center gap-2.5 text-warning">
        <span aria-hidden="true" className="h-px w-5 bg-current opacity-70" />
        No workspace
      </p>
      <h1 className="text-title-2 text-fg">You're not a member of any organization</h1>
      <p className="mt-2 text-body text-fg-muted">
        You may have been removed from your last organization. Ask an owner or admin to invite you again, then open the
        invitation link from your email.
      </p>
    </div>
  )
}
