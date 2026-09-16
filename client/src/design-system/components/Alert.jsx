import { motion } from 'framer-motion'
import { CircleAlert, CircleCheck, Info, ShieldAlert } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { duration, ease } from '../motion/tokens'

const tones = {
  danger: { icon: CircleAlert, classes: 'bg-danger-dim text-danger ring-danger/25' },
  warning: { icon: ShieldAlert, classes: 'bg-warning-dim text-warning ring-warning/25' },
  success: { icon: CircleCheck, classes: 'bg-success-dim text-success ring-success/25' },
  info: { icon: Info, classes: 'bg-info-dim text-info ring-info/25' },
}

/**
 * Inline alert for form-level feedback. Tone is always carried by icon +
 * title text, never by color alone. `danger`/`warning` announce assertively.
 */
export const Alert = forwardRef(function Alert({ tone = 'info', title, children, action, className, ...props }, ref) {
  const { icon: Icon, classes } = tones[tone]
  const assertive = tone === 'danger' || tone === 'warning'

  return (
    <motion.div
      ref={ref}
      role={assertive ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, transition: { duration: duration.fast, ease: ease.exit } }}
      transition={{ duration: duration.moderate, ease: ease.enter }}
      className={cn('relative flex gap-3 overflow-hidden rounded-lg p-3.5 ring-1 ring-inset', classes, className)}
      {...props}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-current opacity-70" />
      <Icon aria-hidden="true" size={18} strokeWidth={2} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-label font-medium">{title}</p>}
        {children && <div className="mt-0.5 text-caption text-fg-muted">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </motion.div>
  )
})
