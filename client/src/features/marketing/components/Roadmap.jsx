import { motion, useScroll } from 'framer-motion'
import { useRef } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { cn } from '@/lib/cn'
import { Reveal, SectionHeading, StatusTag } from './primitives'

const STAGES = [
  {
    status: 'available',
    items: [
      { title: 'Accounts & sessions', body: 'Sign-up, email verification, password reset, secure sessions.' },
      { title: 'Organizations & roles', body: 'Workspaces, invitations, five roles, organization switching.' },
      { title: 'Asset inventory', body: 'Typed, classified, owned assets with search, filters and lifecycle.' },
      { title: 'Software & dependency inventory', body: 'Record the software components each asset runs, with versions.' },
    ],
  },
  {
    status: 'next',
    items: [{ title: 'Vulnerability intelligence', body: 'Public advisory data (CVE and related sources).' }],
  },
  {
    status: 'planned',
    items: [
      { title: 'Matching & findings', body: 'Connect advisories to the software your assets run.' },
      { title: 'Risk prioritization', body: 'Rank findings using criticality and exposure you already record.' },
      { title: 'Remediation tracking', body: 'Assign, track and verify fixes.' },
      { title: 'Authorized scanning', body: 'Discovery for targets you explicitly authorize.' },
      { title: 'Audit log viewer', body: 'Browse the events already being recorded.' },
    ],
  },
]

/** What exists and what doesn't yet — labelled so nothing planned reads as shipped. */
export function Roadmap() {
  const trackRef = useRef(null)
  const { reducedMotion } = useMotionPreference()
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start 80%', 'end 60%'] })

  return (
    <section id="roadmap" aria-labelledby="roadmap-title" className="relative z-[1] bg-ink-950 py-24 sm:py-32">
      <div className="mx-auto max-w-[84rem] px-4 sm:px-6 lg:px-10">
        <SectionHeading index="06" eyebrow="Roadmap" title={<span id="roadmap-title">Inventory first. Vulnerabilities next.</span>}>
          Vulnerability management is only as good as the inventory under it, so that’s what we built first. Everything below
          “Available now” is not in the product yet.
        </SectionHeading>

        <div ref={trackRef} className="relative mt-14 grid gap-10 lg:grid-cols-[1fr_0.8fr_1.4fr] lg:gap-8">
          {/* Progress track (desktop) */}
          <div aria-hidden="true" className="absolute left-0 right-0 top-3 hidden h-px bg-line lg:block">
            <motion.div
              className="h-full origin-left bg-gradient-to-r from-success via-ion to-fg-subtle/40"
              style={reducedMotion ? undefined : { scaleX: scrollYProgress }}
            />
          </div>
          {STAGES.map((stage, s) => (
            <Reveal key={stage.status} delay={s * 0.08} className="relative">
              <div className="relative bg-ink-950 pr-3 lg:inline-block">
                <StatusTag status={stage.status} />
              </div>
              <ul className={cn('mt-6 grid gap-3', stage.status === 'planned' && 'sm:grid-cols-2')}>
                {stage.items.map((item) => (
                  <li
                    key={item.title}
                    className={cn(
                      'rounded-xl p-4',
                      stage.status === 'available' && 'bg-surface ring-1 ring-line',
                      stage.status === 'next' && 'bg-ion/[0.05] ring-1 ring-ion/25',
                      stage.status === 'planned' && 'border border-dashed border-line-strong',
                    )}
                  >
                    <h3 className={cn('text-label', stage.status === 'planned' ? 'text-fg-muted' : 'text-fg')}>{item.title}</h3>
                    <p className={cn('mt-1 text-caption', stage.status === 'planned' ? 'text-fg-subtle' : 'text-fg-muted')}>{item.body}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
