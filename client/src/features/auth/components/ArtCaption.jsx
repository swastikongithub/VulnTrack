import { AnimatePresence, motion } from 'framer-motion'
import { duration, ease } from '@/design-system/motion/tokens'
import { LIFECYCLE } from '../artwork/lifecycle'
import { useLifecycleStage } from '../artwork/useLifecycleStage'

/**
 * Caption anchored to the artwork: the lifecycle stage the HUD is narrating.
 * Decorative duplicate of product concepts → aria-hidden.
 */
export function ArtCaption() {
  const { stage, complete } = useLifecycleStage()
  const item = LIFECYCLE[stage]

  return (
    <div aria-hidden="true" className="max-w-sm">
      <p className="eyebrow flex items-center gap-2 text-fg-subtle">
        <span className="text-fg-muted">Vulnerability lifecycle</span>
        <span className="h-px w-6 bg-line-strong" />
        <span className={complete ? 'tabular text-success' : 'tabular'}>{`${String(stage + 1).padStart(2, '0')}/08`}</span>
      </p>
      <div className="relative mt-3 min-h-[4.25rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item.name}
            initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -4, filter: 'blur(3px)', transition: { duration: duration.base, ease: ease.exit } }}
            transition={{ duration: duration.slow, ease: ease.enter }}
          >
            <p className="text-title-2 text-fg">{item.name}</p>
            <p className="mt-1 text-caption text-fg-muted">
              {item.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
