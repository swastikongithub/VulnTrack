import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Logo } from '@/design-system/components'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { duration, ease } from '@/design-system/motion/tokens'
import { useSessionStore } from '@/features/auth/sessionStore'
import { cn } from '@/lib/cn'
import { scrollToSection } from '../lib/scrollToSection'
import { CtaLink } from './primitives'

const NAV_LINKS = [
  { id: 'product', label: 'Product' },
  { id: 'access', label: 'Access' },
  { id: 'security', label: 'Security' },
  { id: 'roadmap', label: 'Roadmap' },
]

function SectionLink({ id, children, className, onNavigate }) {
  const { reducedMotion } = useMotionPreference()
  return (
    <a
      href={`#${id}`}
      className={className}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
        scrollToSection(id, { reducedMotion })
      }}
    >
      {children}
    </a>
  )
}

/**
 * Sticky marketing header: transparent over the hero, solid once scrolled,
 * with a hairline scroll-progress indicator. Below 768px the links collapse
 * into a disclosure panel.
 */
export function MarketingNav() {
  const { scrollY, scrollYProgress } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const authenticated = useSessionStore((s) => s.status === 'authenticated')
  const menuId = useId()
  const toggleRef = useRef(null)
  const panelRef = useRef(null)

  useMotionValueEvent(scrollY, 'change', (y) => {
    const next = y > 12
    if (next !== scrolled) setScrolled(next)
  })

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    const onPointer = (event) => {
      if (!panelRef.current?.contains(event.target) && !toggleRef.current?.contains(event.target)) setOpen(false)
    }
    const onResize = () => {
      if (window.matchMedia('(min-width: 48rem)').matches) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const solid = scrolled || open

  return (
    <header className="fixed inset-x-0 top-0 z-[var(--z-sticky)]">
      <div
        className={cn(
          'transition-[background-color,box-shadow] duration-[var(--duration-moderate)]',
          solid ? 'bg-ink-950/85 shadow-[inset_0_-1px_0_var(--color-line)] backdrop-blur-md' : 'bg-transparent',
        )}
      >
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-[84rem] items-center gap-4 px-4 sm:px-6 lg:gap-6 lg:px-10">
          <Link
            to="/"
            aria-label="VulnTrack home"
            className="-m-1.5 rounded-md p-1.5"
            onClick={(event) => {
              if (window.location.pathname === '/') {
                event.preventDefault()
                window.scrollTo({ top: 0 })
              }
            }}
          >
            <Logo />
          </Link>

          <ul className="hidden items-center md:flex lg:ml-4 lg:gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.id}>
                <SectionLink
                  id={link.id}
                  className="inline-flex h-10 items-center whitespace-nowrap rounded-md px-2.5 text-label text-fg-muted transition-colors hover:text-fg lg:px-3"
                >
                  {link.label}
                </SectionLink>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1 sm:flex">
              {authenticated ? (
                <CtaLink to="/organization" size="md" trailingIcon={<ArrowRight aria-hidden="true" size={16} />}>
                  Open workspace
                </CtaLink>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="inline-flex h-11 items-center whitespace-nowrap rounded-md px-3 text-label text-fg-muted transition-colors hover:text-fg"
                  >
                    Sign in
                  </Link>
                  <CtaLink to="/signup" size="md">
                    Create workspace
                  </CtaLink>
                </>
              )}
            </div>
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((value) => !value)}
              className="grid size-11 place-items-center rounded-md text-fg-muted ring-1 ring-inset ring-line transition-colors hover:bg-surface-hover hover:text-fg md:hidden"
            >
              <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
              {open ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
            </button>
          </div>
        </nav>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              ref={panelRef}
              id={menuId}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.enter } }}
              exit={{ opacity: 0, y: -6, transition: { duration: duration.fast, ease: ease.exit } }}
              className="border-t border-line-subtle px-4 pb-5 pt-2 sm:px-6 md:hidden"
            >
              <ul className="flex flex-col">
                {NAV_LINKS.map((link) => (
                  <li key={link.id}>
                    <SectionLink
                      id={link.id}
                      onNavigate={() => setOpen(false)}
                      className="flex h-12 items-center border-b border-line-subtle text-body-lg text-fg"
                    >
                      {link.label}
                    </SectionLink>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid gap-3">
                {authenticated ? (
                  <CtaLink to="/organization" className="w-full">
                    Open workspace
                  </CtaLink>
                ) : (
                  <>
                    <CtaLink to="/signup" className="w-full">
                      Create workspace
                    </CtaLink>
                    <CtaLink to="/login" variant="secondary" className="w-full">
                      Sign in
                    </CtaLink>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scroll progress hairline — a motion value, no React renders while scrolling */}
      <motion.div
        aria-hidden="true"
        className="h-px origin-left bg-gradient-to-r from-ion/0 via-ion/70 to-ion"
        style={{ scaleX: scrollYProgress }}
      />
    </header>
  )
}
