import { motion } from 'framer-motion'
import { Check, Clock3, MailCheck, X } from 'lucide-react'
import { duration, ease } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'

const TONES = {
  pending: { icon: MailCheck, color: 'text-ion', ring: 'var(--color-ion)' },
  progress: { icon: null, color: 'text-ion', ring: 'var(--color-ion)' },
  success: { icon: Check, color: 'text-success', ring: 'var(--color-success)' },
  expired: { icon: Clock3, color: 'text-warning', ring: 'var(--color-warning)' },
  failure: { icon: X, color: 'text-danger', ring: 'var(--color-danger)' },
  recovery: { icon: MailCheck, color: 'text-iris', ring: 'var(--color-iris)' },
}

/**
 * Result emblem for outcome screens (verification, reset, recovery).
 * An instrument-style ring draws around a glyph; `progress` spins an arc.
 * Decorative — the adjacent heading carries the meaning.
 */
export function StatusEmblem({ tone = 'pending', className }) {
  const { icon: Icon, color, ring } = TONES[tone]

  return (
    <div aria-hidden="true" className={cn('relative size-16', color, className)}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-full -rotate-90">
        <circle cx="32" cy="32" r="30" fill="none" stroke="var(--color-line)" strokeWidth="1" />
        {tone === 'progress' ? (
          <circle
            cx="32"
            cy="32"
            r="30"
            fill="none"
            stroke={ring}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="44 145"
            className="motion-essential origin-center animate-spin"
            style={{ animationDuration: '1.1s', transformBox: 'fill-box' }}
          />
        ) : (
          <motion.circle
            key={tone}
            cx="32"
            cy="32"
            r="30"
            fill="none"
            stroke={ring}
            strokeWidth="1.5"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: ease.emphasized }}
          />
        )}
      </svg>
      <span className="absolute inset-2 grid place-items-center rounded-full bg-current/10 ring-1 ring-inset ring-current/20">
        {Icon && (
          <motion.span
            key={tone}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: duration.moderate, ease: ease.enter, delay: 0.25 }}
          >
            <Icon size={22} strokeWidth={2} />
          </motion.span>
        )}
        {!Icon && <span className="size-1.5 rounded-full bg-current" />}
      </span>
    </div>
  )
}
