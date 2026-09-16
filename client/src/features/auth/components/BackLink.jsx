import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { StaggerItem } from './Stagger'

/** Escape route back to sign-in for recovery / verification flows. */
export function BackLink({ to = '/login', children = 'Back to sign in' }) {
  return (
    <StaggerItem className="mb-10">
      <Link
        to={to}
        className="group inline-flex h-9 items-center gap-2 rounded-sm pr-2 text-label text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion"
      >
        <span className="grid size-7 place-items-center rounded-full ring-1 ring-inset ring-line transition-[transform,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-enter)] group-hover:-translate-x-0.5 group-hover:ring-line-strong">
          <ArrowLeft aria-hidden="true" size={14} />
        </span>
        {children}
      </Link>
    </StaggerItem>
  )
}
