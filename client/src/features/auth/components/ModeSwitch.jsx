import { motion } from 'framer-motion'
import { Link, useLocation } from 'react-router'
import { spring } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'

const ITEMS = [
  { to: '/login', label: 'Sign in' },
  { to: '/signup', label: 'Create account' },
]

/**
 * Segmented switch between sign-in and account creation. These are links
 * (navigation, not tabs) — the active item carries aria-current="page".
 * The indicator is a shared layout element that glides between items.
 */
export function ModeSwitch({ className }) {
  const { pathname } = useLocation()

  return (
    <nav aria-label="Account access" className={className}>
      <ul className="relative grid grid-cols-2 rounded-md bg-ink-900/80 p-1 ring-1 ring-inset ring-line">
        {ITEMS.map((item) => {
          const active = pathname === item.to
          return (
            <li key={item.to} className="relative">
              {active && (
                <motion.span
                  layoutId="mode-switch-indicator"
                  transition={spring.layout}
                  className="absolute inset-0 rounded-[7px] bg-surface-hover shadow-e1 ring-1 ring-inset ring-line-strong"
                />
              )}
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-11 items-center justify-center rounded-[7px] text-label transition-colors duration-[var(--duration-fast)]',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ion',
                  active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
