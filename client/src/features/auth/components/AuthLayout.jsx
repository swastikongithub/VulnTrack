import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { Link, useLocation, useOutlet } from 'react-router'
import { Logo } from '@/design-system/components'
import { duration, ease, travel } from '@/design-system/motion/tokens'
import { ArtworkStage } from '../artwork/ArtworkStage'
import { useSceneStore } from '../artwork/sceneStore'
import { useArtLayout } from '../artwork/useArtLayout'
import { ArtCaption } from './ArtCaption'
import { DevPreviewPanel } from './DevPreviewPanel'
import { ModeSwitch } from './ModeSwitch'
import { MotionToggle } from './MotionToggle'

/** Depth of each screen in the auth flow — drives transition direction. */
const DEPTH = {
  '/login': 0,
  '/signup': 1,
  '/forgot-password': 1,
  '/reset-password': 2,
  '/verify-email': 2,
  '/session': 3,
}

const screen = {
  initial: (dir) => ({ opacity: 0, x: dir * travel.screen, filter: 'blur(6px)' }),
  animate: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: duration.slow, ease: ease.enter } },
  exit: (dir) => ({
    opacity: 0,
    x: dir * -travel.screen * 0.6,
    filter: 'blur(4px)',
    transition: { duration: duration.base, ease: ease.exit },
  }),
}

function useDirection(pathname) {
  const [nav, setNav] = useState({ pathname, direction: 1 })
  if (nav.pathname !== pathname) {
    // Derive during render (React "adjust state on prop change" pattern)
    const direction = (DEPTH[pathname] ?? 0) >= (DEPTH[nav.pathname] ?? 0) ? 1 : -1
    setNav({ pathname, direction })
    return direction
  }
  return nav.direction
}

/**
 * Persistent shell for every auth screen. The artwork never unmounts between
 * routes, so screen changes read as state changes of one continuous system.
 *
 *  ≥1024px  art column (sticky, fills remaining width) | form panel (fixed width)
 *  <1024px  art window on top, form panel as a sheet that scrolls over it
 */
export function AuthLayout() {
  const anchorRef = useRef(null)
  const location = useLocation()
  const outlet = useOutlet()
  const direction = useDirection(location.pathname)
  const handingOff = useSceneStore((s) => s.status === 'success' || s.status === 'transition')
  const showModeSwitch = (location.pathname === '/login' || location.pathname === '/signup') && !handingOff

  useArtLayout(anchorRef)

  return (
    <>
      <a
        href="#auth-content"
        className="sr-only-focusable fixed left-4 top-4 z-[var(--z-skiplink)] rounded-md bg-ion px-4 py-2 text-label text-on-ion"
      >
        Skip to form
      </a>

      <ArtworkStage />

      <div className="relative z-[var(--z-content)] flex min-h-dvh flex-col lg:flex-row">
        {/* Art anchor: mobile art window / desktop art column */}
        <div
          ref={anchorRef}
          className="pointer-events-none relative h-[clamp(15rem,40svh,22rem)] shrink-0 md:h-[clamp(17rem,42svh,26rem)] lg:sticky lg:top-0 lg:h-dvh lg:flex-1"
        >
          <header className="pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:px-10 lg:pt-9">
            <Link
              to="/login"
              aria-label="VulnTrack — sign in"
              className="inline-flex min-h-11 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ion"
            >
              <Logo />
            </Link>
            <MotionToggle className="lg:hidden" />
          </header>

          <p className="sr-only">
            Decorative artwork: an animated perimeter of asset nodes around a protected core, with a ring narrating
            the vulnerability lifecycle from discovery to closure.
          </p>

          <div className="absolute inset-x-10 bottom-9 hidden items-end justify-between gap-8 lg:flex">
            <ArtCaption />
            <MotionToggle />
          </div>
        </div>

        {/* Form panel */}
        <main
          id="auth-content"
          tabIndex={-1}
          className="relative flex flex-1 flex-col focus:outline-none md:px-8 md:pb-8 lg:w-[clamp(28rem,36vw,38rem)] lg:flex-none lg:px-0 lg:pb-0"
        >
          <div className="relative flex flex-1 flex-col rounded-t-[1.75rem] bg-surface/[0.97] shadow-e3 ring-1 ring-line md:mx-auto md:w-full md:max-w-[36rem] md:rounded-2xl lg:max-w-none lg:rounded-none lg:bg-surface/[0.94] lg:shadow-none lg:ring-0">
            {/* Panel edge: hairline + light that tracks the scan sweep (desktop) */}
            <span aria-hidden="true" className="absolute inset-y-0 left-0 hidden w-px bg-line lg:block" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 hidden w-px lg:block">
              <span className="sticky top-0 block h-dvh overflow-hidden">
                <span
                  id="scan-edge-light"
                  className="absolute left-0 top-0 block h-48 w-px bg-[linear-gradient(transparent,var(--color-ion),transparent)] opacity-0 will-change-transform"
                />
              </span>
            </span>
            {/* Sheet top highlight (mobile/tablet) */}
            <span
              aria-hidden="true"
              className="absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(124_220_255/0.45),transparent)] lg:hidden"
            />

            <div className="flex flex-1 flex-col px-5 pb-8 pt-8 xs:px-7 sm:px-10 md:pt-10 lg:justify-center lg:px-12 lg:py-16 xl:px-16 3xl:px-20">
              <div className="mx-auto w-full max-w-[25.5rem]">
                {showModeSwitch && <ModeSwitch className="mb-10" />}

                <AnimatePresence mode="wait" custom={direction} initial={false}>
                  <motion.div
                    key={location.pathname}
                    custom={direction}
                    variants={screen}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {outlet}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line-subtle px-5 py-5 text-caption text-fg-subtle xs:px-7 sm:px-10 lg:px-12 xl:px-16">
              <p>© {new Date().getFullYear()} VulnTrack</p>
              <p>Access is limited to authorized workspace members.</p>
            </footer>
          </div>
        </main>
      </div>

      {import.meta.env.DEV && <DevPreviewPanel />}
    </>
  )
}
