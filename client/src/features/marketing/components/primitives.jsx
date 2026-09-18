import { motion } from 'framer-motion'
import { Link } from 'react-router'
import { buttonBase, buttonSizes, buttonVariants } from '@/design-system/components/buttonStyles'
import { duration, ease } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'

/** A route link styled as a button (same recipe as <Button>). */
export function CtaLink({ to, variant = 'primary', size = 'lg', trailingIcon, className, children, ...props }) {
  return (
    <Link to={to} className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)} {...props}>
      <span>{children}</span>
      {trailingIcon && (
        <span className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-enter)] group-hover/button:translate-x-0.5">
          {trailingIcon}
        </span>
      )}
    </Link>
  )
}

/** Fades content up once as it enters the viewport. Under reduced motion only opacity changes. */
export function Reveal({ as = 'div', delay = 0, className, children, ...props }) {
  const Component = motion[as]
  return (
    <Component
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: duration.slow + 0.1, ease: ease.enter, delay }}
      className={className}
      {...props}
    >
      {children}
    </Component>
  )
}

/**
 * Section heading: numbered mono eyebrow, h2, supporting copy. The h2 is the
 * focus target for in-page navigation (data-section-heading).
 */
export function SectionHeading({ index, eyebrow, title, children, className, align = 'left' }) {
  return (
    <Reveal className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <p className={cn('eyebrow mb-5 flex items-center gap-3 text-ion', align === 'center' && 'justify-center')}>
        <span className="tabular text-fg-subtle">{index}</span>
        <span aria-hidden="true" className="h-px w-6 bg-current opacity-60" />
        {eyebrow}
      </p>
      <h2
        data-section-heading
        tabIndex={-1}
        className="text-[1.875rem] leading-[1.1] font-[560] tracking-[-0.03em] text-fg focus:outline-none sm:text-[2.5rem] lg:text-[2.875rem]"
      >
        {title}
      </h2>
      {children && <div className="mt-5 text-body-lg text-fg-muted">{children}</div>}
    </Reveal>
  )
}

/** Availability label: shipped features vs roadmap, never ambiguous. */
export function StatusTag({ status, className }) {
  const tones = {
    available: 'text-success ring-success/30 bg-success-dim',
    next: 'text-ion ring-ion/30 bg-ion-dim',
    planned: 'text-fg-subtle ring-line bg-surface-raised',
  }
  const labels = { available: 'Available now', next: 'Next', planned: 'Planned' }
  return (
    <span
      className={cn(
        'eyebrow inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 ring-1 ring-inset',
        tones[status],
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', status === 'planned' ? 'ring-1 ring-current' : 'bg-current')} />
      {labels[status]}
    </span>
  )
}
