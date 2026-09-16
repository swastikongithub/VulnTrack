import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { spring } from '../motion/tokens'

/** Icon-only control. `label` is required and becomes the accessible name. */
export function IconButton({ label, className, children, ...props }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      transition={spring.press}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-sm text-fg-subtle',
        'transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover hover:text-fg',
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ion',
        'aria-pressed:text-ion',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true">{children}</span>
    </motion.button>
  )
}
