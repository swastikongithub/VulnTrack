import { Link } from 'react-router'
import { cn } from '@/lib/cn'

const styles =
  'relative rounded-xs font-medium text-ion decoration-ion/40 underline-offset-4 transition-colors duration-[var(--duration-fast)] ' +
  'hover:text-ion-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion'

/** In-app navigation link. Use `as="button"` for actions styled as links. */
export function TextLink({ to, as, className, children, ...props }) {
  if (as === 'button') {
    return (
      <button type="button" className={cn(styles, 'disabled:text-fg-subtle disabled:no-underline', className)} {...props}>
        {children}
      </button>
    )
  }
  return (
    <Link to={to} className={cn(styles, className)} {...props}>
      {children}
    </Link>
  )
}
