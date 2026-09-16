import { Pause, Play } from 'lucide-react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { cn } from '@/lib/cn'
import { sceneActions, useSceneStore } from '../artwork/sceneStore'

/**
 * Pause / resume the background artwork (WCAG 2.2.2 — moving content can be
 * stopped). Hidden when the OS already requests reduced motion.
 */
export function MotionToggle({ className }) {
  const { reducedMotion } = useMotionPreference()
  const paused = useSceneStore((s) => s.paused)
  if (reducedMotion) return null

  return (
    <button
      type="button"
      aria-pressed={paused}
      onClick={sceneActions.togglePaused}
      className={cn(
        'pointer-events-auto inline-flex h-11 items-center lg:h-9 gap-2 rounded-full bg-ink-900/70 px-3.5 text-caption text-fg-muted ring-1 ring-inset ring-line backdrop-blur-sm',
        'transition-colors duration-[var(--duration-fast)] hover:text-fg hover:ring-line-strong',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion',
        className,
      )}
    >
      {paused ? <Play aria-hidden="true" size={13} /> : <Pause aria-hidden="true" size={13} />}
      <span>{paused ? 'Resume motion' : 'Pause motion'}</span>
    </button>
  )
}
