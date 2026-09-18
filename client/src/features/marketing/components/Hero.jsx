import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { useRef } from 'react'
import { buttonBase, buttonSizes, buttonVariants } from '@/design-system/components/buttonStyles'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { duration, ease } from '@/design-system/motion/tokens'
import { useSessionStore } from '@/features/auth/sessionStore'
import { cn } from '@/lib/cn'
import { scrollToSection } from '../lib/scrollToSection'
import { CtaLink, StatusTag } from './primitives'

const FACTS = [
  { value: '10', label: 'Asset types' },
  { value: '8', label: 'Identifier kinds' },
  { value: '5', label: 'Roles' },
  { value: 'Argon2id', label: 'Password hashing' },
]

const enter = (i) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.slow + 0.2, ease: ease.enter, delay: 0.15 + i * 0.08 } },
})

export function Hero() {
  const ref = useRef(null)
  const { reducedMotion } = useMotionPreference()
  const authenticated = useSessionStore((s) => s.status === 'authenticated')
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [0, -80])
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.15])

  return (
    <section ref={ref} aria-labelledby="hero-title" className="relative">
      <motion.div
        style={reducedMotion ? undefined : { y, opacity }}
        className="mx-auto flex min-h-[100svh] max-w-[84rem] flex-col justify-end px-4 pb-12 pt-[50svh] sm:px-6 sm:pt-[56svh] lg:justify-center lg:px-10 lg:pb-16 lg:pt-28"
      >
        <div className="max-w-[36rem] lg:max-w-[30rem] xl:max-w-[40rem]">
          <motion.p {...enter(0)} className="eyebrow mb-5 flex items-center gap-2.5 text-ion">
            <span aria-hidden="true" className="h-px w-5 bg-current opacity-70" />
            Attack-surface inventory
          </motion.p>
          <motion.h1
            {...enter(1)}
            id="hero-title"
            className="text-[2.375rem] leading-[1.02] font-[560] tracking-[-0.04em] text-fg xs:text-[2.75rem] sm:text-[3.5rem] xl:text-[4.25rem]"
          >
            Know every system you have to defend.
          </motion.h1>
          <motion.p {...enter(2)} className="mt-6 max-w-[34rem] text-body-lg text-fg-muted sm:text-[1.0625rem]">
            VulnTrack is one inventory of everything your security team is responsible for — applications, APIs, servers,
            databases, repositories and cloud resources — each with its criticality, exposure and owner, behind role-based
            access and audit logging.
          </motion.p>

          <motion.div {...enter(3)} className="mt-8 flex flex-col gap-3 xs:flex-row">
            {authenticated ? (
              <CtaLink to="/organization" trailingIcon={<ArrowRight aria-hidden="true" size={17} />}>
                Open your workspace
              </CtaLink>
            ) : (
              <CtaLink to="/signup" trailingIcon={<ArrowRight aria-hidden="true" size={17} />}>
                Create your workspace
              </CtaLink>
            )}
            <a
              href="#product"
              onClick={(event) => {
                event.preventDefault()
                scrollToSection('product', { reducedMotion })
              }}
              className={cn(buttonBase, buttonVariants.secondary, buttonSizes.lg)}
            >
              See how it works
              <ArrowDown aria-hidden="true" size={17} className="text-fg-subtle" />
            </a>
          </motion.div>

          <motion.dl {...enter(4)} className="mt-9 grid gap-2.5 text-caption">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <dt>
                <StatusTag status="available" />
              </dt>
              <dd className="text-fg-muted">Asset inventory · Teams &amp; roles · Audit logging</dd>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <dt>
                <StatusTag status="next" />
              </dt>
              <dd className="text-fg-muted">Software &amp; dependency inventory</dd>
            </div>
          </motion.dl>
        </div>

        <motion.dl
          {...enter(5)}
          className="mt-12 grid max-w-[40rem] grid-cols-2 gap-px overflow-hidden rounded-lg bg-line-subtle ring-1 ring-line sm:grid-cols-4 lg:mt-14 lg:max-w-[30rem] lg:grid-cols-2 xl:max-w-[40rem] xl:grid-cols-4"
        >
          {FACTS.map((fact) => (
            <div key={fact.label} className="bg-ink-950/85 px-4 py-3.5">
              <dt className="eyebrow text-fg-subtle">{fact.label}</dt>
              <dd className="mt-1 text-title-2 tabular text-fg">{fact.value}</dd>
            </div>
          ))}
        </motion.dl>
      </motion.div>
    </section>
  )
}
