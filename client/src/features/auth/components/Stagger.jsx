import { motion } from 'framer-motion'
import { duration, ease, stagger, travel } from '@/design-system/motion/tokens'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: stagger.base, delayChildren: 0.04 } },
}

const item = {
  hidden: { opacity: 0, y: travel.element },
  visible: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.enter } },
}

/** Staggered entrance for a screen's content blocks (30–50ms per item). */
export function Stagger({ as = 'div', children, className, ...props }) {
  const Component = motion[as]
  return (
    <Component variants={container} initial="hidden" animate="visible" className={className} {...props}>
      {children}
    </Component>
  )
}

export function StaggerItem({ as = 'div', children, className, ...props }) {
  const Component = motion[as]
  return (
    <Component variants={item} className={className} {...props}>
      {children}
    </Component>
  )
}
