import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Spinner } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'
import { sessionActions, useSessionStore } from '@/features/auth/sessionStore'
import { describeOrganizationError } from '@/services/organization/organizationErrors'
import { paced, switchOrganization } from '@/services/organization/organizationApi'
import { handleSessionLoss } from '../hooks/useApiResource'
import { OrganizationMark } from './Identity'

/**
 * Current-organization menu. Lists only the organizations the server reports
 * the user belongs to (session.memberships); switching asks the server, which
 * re-checks membership and stores the choice on the session.
 *
 * Keyboard: Enter/Space/↓ opens and focuses the current item, ↑/↓/Home/End
 * move, Escape closes and returns focus to the button.
 */
export function OrganizationSwitcher({ onSwitched }) {
  const memberships = useSessionStore((s) => s.session?.memberships ?? [])
  const current = memberships.find((m) => m.current) ?? memberships[0]
  const [open, setOpen] = useState(false)
  const [pendingId, setPendingId] = useState(null)
  const [error, setError] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()

  const items = () => [...(menuRef.current?.querySelectorAll('[role="menuitemradio"]') ?? [])]
  const focusItem = (index) => {
    const list = items()
    list[(index + list.length) % list.length]?.focus()
  }

  const close = ({ restoreFocus = true } = {}) => {
    setOpen(false)
    setError(null)
    if (restoreFocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return undefined
    const currentIndex = Math.max(0, memberships.findIndex((m) => m.current))
    focusItem(currentIndex)
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setOpen(false)
        setError(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // Focus once when the menu opens.
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null

  const select = async (membership) => {
    if (pendingId) return
    if (membership.current) return close()
    setPendingId(membership.organization.id)
    setError(null)
    try {
      const session = await paced(switchOrganization(membership.organization.id), 500)
      sessionActions.establish(session)
      setOpen(false)
      buttonRef.current?.focus()
      onSwitched?.(session)
    } catch (err) {
      handleSessionLoss(err)
      setError(err)
    } finally {
      setPendingId(null)
    }
  }

  const onMenuKeyDown = (event) => {
    const list = items()
    const index = list.indexOf(document.activeElement)
    if (event.key === 'ArrowDown') focusItem(index + 1)
    else if (event.key === 'ArrowUp') focusItem(index - 1)
    else if (event.key === 'Home') focusItem(0)
    else if (event.key === 'End') focusItem(list.length - 1)
    else if (event.key === 'Escape') close()
    else if (event.key === 'Tab') close({ restoreFocus: false })
    else return
    if (event.key !== 'Tab') event.preventDefault()
  }

  const errorCopy = error ? describeOrganizationError(error, 'switch to that organization') : null

  return (
    <div className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          'group flex h-12 min-w-0 max-w-full items-center gap-3 rounded-lg py-1.5 pl-1.5 pr-3 text-left transition-colors duration-[var(--duration-fast)]',
          'ring-1 ring-inset ring-transparent hover:bg-surface-raised hover:ring-line aria-expanded:bg-surface-raised aria-expanded:ring-line-strong',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion',
        )}
      >
        <OrganizationMark name={current.organization.name} />
        <span className="min-w-0">
          <span className="sr-only">Current organization: </span>
          <span className="block truncate text-label text-fg">{current.organization.name}</span>
          <span className="block truncate text-caption text-fg-subtle">
            <span className="sr-only">Your role: </span>
            {current.roleLabel}
          </span>
        </span>
        <ChevronsUpDown aria-hidden="true" size={15} className="ml-1 shrink-0 text-fg-subtle group-hover:text-fg-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Switch organization"
            onKeyDown={onMenuKeyDown}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: duration.base, ease: ease.enter } }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: duration.fast, ease: ease.exit } }}
            className="absolute left-0 top-[calc(100%+0.5rem)] z-[var(--z-popover)] w-[min(20rem,calc(100vw-2rem))] origin-top-left rounded-xl bg-ink-800 p-1.5 shadow-e3 ring-1 ring-line-strong"
          >
            <p className="eyebrow flex items-center gap-2 px-2.5 pb-2 pt-2 text-fg-subtle" aria-hidden="true">
              <span className="h-px w-4 bg-current opacity-70" />
              Organizations · {memberships.length}
            </p>
            <div className="max-h-[min(22rem,60dvh)] overflow-y-auto">
              {memberships.map((membership) => {
                const pending = pendingId === membership.organization.id
                return (
                  <button
                    key={membership.organization.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={membership.current}
                    aria-busy={pending || undefined}
                    tabIndex={-1}
                    onClick={() => select(membership)}
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-[var(--duration-fast)]',
                      'hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ion',
                      membership.current && 'bg-surface-raised',
                    )}
                  >
                    <OrganizationMark name={membership.organization.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label text-fg">{membership.organization.name}</span>
                      <span className="block truncate text-caption text-fg-subtle">{membership.roleLabel}</span>
                    </span>
                    <span className="grid size-5 shrink-0 place-items-center text-ion">
                      {pending ? <Spinner size={15} /> : membership.current ? <Check aria-hidden="true" size={16} strokeWidth={2.4} /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
            <AnimatePresence initial={false}>
              {errorCopy && (
                <Alert key="error" tone="danger" title={errorCopy.title} className="m-1 mt-2">
                  {errorCopy.body}
                </Alert>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="sr-only" role="status">
        {pendingId ? 'Switching organization' : ''}
      </p>
    </div>
  )
}
