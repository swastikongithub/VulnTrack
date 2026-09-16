import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Spinner } from '@/design-system/components'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { duration, ease } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'

const STEPS = ['Credentials verified', 'Workspace membership confirmed', 'Secure session established']

/**
 * Authentication → session transition. Represents the server-side sequence
 * (credential check, organization membership, session creation) while the
 * artwork dollies into the core. Calls onComplete when finished.
 */
export function SessionHandoff({ email, onComplete }) {
  const { reducedMotion } = useMotionPreference()
  const [done, setDone] = useState(0)

  useEffect(() => {
    const stepMs = reducedMotion ? 180 : 520
    if (done >= STEPS.length) {
      const id = setTimeout(onComplete, reducedMotion ? 150 : 700)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setDone((d) => d + 1), done === 0 ? stepMs * 0.6 : stepMs)
    return () => clearTimeout(id)
  }, [done, reducedMotion, onComplete])

  return (
    <div>
      <p className="eyebrow mb-4 flex items-center gap-2.5 text-success">
        <span aria-hidden="true" className="h-px w-5 bg-current opacity-70" />
        Authenticated
      </p>
      <h1 className="text-title-1 text-fg">Opening your workspace</h1>
      <p className="mt-3 truncate text-body text-fg-muted">
        Signed in as <span className="text-fg">{email}</span>
      </p>

      <ol className="mt-8 space-y-1 border-l border-line pl-5" aria-label="Sign-in progress">
        {STEPS.map((label, i) => {
          const complete = i < done
          const active = i === done
          return (
            <motion.li
              key={label}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: complete || active ? 1 : 0.45, x: 0 }}
              transition={{ duration: duration.moderate, ease: ease.enter, delay: i * 0.05 }}
              className="relative flex h-10 items-center gap-3 text-label"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -left-[26px] size-2.5 rounded-full ring-4 ring-surface transition-colors duration-300',
                  complete ? 'bg-success' : active ? 'bg-ion' : 'bg-ink-600',
                )}
              />
              <span className={cn('grid size-5 place-items-center', complete ? 'text-success' : 'text-ion')} aria-hidden="true">
                {complete ? <Check size={16} strokeWidth={2.5} /> : active ? <Spinner size={14} /> : null}
              </span>
              <span className={complete ? 'text-fg' : 'text-fg-muted'}>{label}</span>
              <span className="sr-only">{complete ? '(done)' : active ? '(in progress)' : '(pending)'}</span>
            </motion.li>
          )
        })}
      </ol>

      <p className="sr-only" role="status">
        {done >= STEPS.length ? 'Signed in. Opening your workspace.' : 'Signing you in…'}
      </p>
    </div>
  )
}
