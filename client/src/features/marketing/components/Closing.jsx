import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { Logo } from '@/design-system/components'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { useSessionStore } from '@/features/auth/sessionStore'
import { PerimeterMotif } from '@/features/organization/components/PerimeterMotif'
import { scrollToSection } from '../lib/scrollToSection'
import { CtaLink, Reveal } from './primitives'

export function FinalCta() {
  const authenticated = useSessionStore((s) => s.status === 'authenticated')
  return (
    <section aria-labelledby="cta-title" className="relative z-[1] overflow-hidden bg-ink-950 py-28 sm:py-36">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 w-[46rem] max-w-[140vw] -translate-x-1/2 -translate-y-1/2 opacity-60">
        <PerimeterMotif className="h-auto w-full" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgb(124_220_255/0.08),transparent_45%)]"
      />
      <Reveal className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h2 id="cta-title" className="text-[2.25rem] leading-[1.05] font-[560] tracking-[-0.035em] text-fg sm:text-[3.25rem]">
          Start with what you run.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-body-lg text-fg-muted">
          Create a workspace, invite your team, and record the systems you’re responsible for.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 xs:flex-row">
          {authenticated ? (
            <CtaLink to="/organization" trailingIcon={<ArrowRight aria-hidden="true" size={17} />}>
              Open your workspace
            </CtaLink>
          ) : (
            <>
              <CtaLink to="/signup" trailingIcon={<ArrowRight aria-hidden="true" size={17} />}>
                Create your workspace
              </CtaLink>
              <CtaLink to="/login" variant="secondary">
                Sign in
              </CtaLink>
            </>
          )}
        </div>
      </Reveal>
    </section>
  )
}

const SECTIONS = [
  { id: 'product', label: 'Product' },
  { id: 'identifiers', label: 'Identifiers' },
  { id: 'access', label: 'Access' },
  { id: 'security', label: 'Security' },
  { id: 'roadmap', label: 'Roadmap' },
]

export function MarketingFooter() {
  const { reducedMotion } = useMotionPreference()
  return (
    <footer className="relative z-[1] border-t border-line-subtle bg-ink-950">
      <div className="mx-auto grid max-w-[84rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto_auto] md:gap-16 lg:px-10">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-caption text-fg-subtle">
            Asset inventory and access control for security teams. Vulnerability management is on the roadmap.
          </p>
        </div>
        <nav aria-label="Page sections">
          <p className="eyebrow mb-3 text-fg-subtle">On this page</p>
          <ul className="grid gap-1">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  onClick={(event) => {
                    event.preventDefault()
                    scrollToSection(section.id, { reducedMotion })
                  }}
                  className="inline-flex h-9 items-center text-label text-fg-muted hover:text-fg"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Account">
          <p className="eyebrow mb-3 text-fg-subtle">Account</p>
          <ul className="grid gap-1">
            <li>
              <Link to="/signup" className="inline-flex h-9 items-center text-label text-fg-muted hover:text-fg">
                Create workspace
              </Link>
            </li>
            <li>
              <Link to="/login" className="inline-flex h-9 items-center text-label text-fg-muted hover:text-fg">
                Sign in
              </Link>
            </li>
            <li>
              <Link to="/forgot-password" className="inline-flex h-9 items-center text-label text-fg-muted hover:text-fg">
                Reset password
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto flex max-w-[84rem] flex-wrap justify-between gap-2 border-t border-line-subtle px-4 py-5 text-caption text-fg-subtle sm:px-6 lg:px-10">
        <p>© {new Date().getFullYear()} VulnTrack</p>
        <p>Halcyon Labs and all sample data on this page are fictional.</p>
      </div>
    </footer>
  )
}
