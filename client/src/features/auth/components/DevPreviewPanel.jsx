import { AnimatePresence, motion } from 'framer-motion'
import { FlaskConical, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { duration, ease } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'
import { MOCK_SCENARIOS } from '@/services/auth/mockScenarios'

const FILL_BY_PATH = {
  '/login': MOCK_SCENARIOS.login,
  '/signup': MOCK_SCENARIOS.signup,
  '/forgot-password': MOCK_SCENARIOS.forgot,
}

const itemClass =
  'block w-full rounded-sm px-2.5 py-2 text-left text-caption text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ion'

/**
 * DEVELOPMENT ONLY — exercises mock auth scenarios and motion preferences.
 * Not rendered in production builds.
 */
export function DevPreviewPanel() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { override, setOverride, systemReducedMotion } = useMotionPreference()
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const fills = FILL_BY_PATH[pathname]

  useEffect(() => {
    if (!open) return undefined
    panelRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="fixed right-4 top-4 z-[var(--z-devtools)] max-lg:bottom-4 max-lg:top-auto">
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            id="dev-preview-panel"
            role="dialog"
            aria-label="Preview states"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: duration.fast, ease: ease.exit } }}
            transition={{ duration: duration.base, ease: ease.enter }}
            className="absolute right-0 top-12 max-h-[70dvh] w-72 origin-top-right max-lg:bottom-12 max-lg:top-auto max-lg:origin-bottom-right overflow-y-auto rounded-lg bg-ink-800/95 p-2 shadow-e3 ring-1 ring-line-strong backdrop-blur-md focus:outline-none"
          >
            <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
              <p className="eyebrow text-warning">Dev · mock scenarios</p>
              <button
                type="button"
                aria-label="Close preview panel"
                onClick={() => {
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
                className="grid size-7 place-items-center rounded-sm text-fg-subtle hover:bg-surface-hover hover:text-fg"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>

            {fills && (
              <section className="mt-1 border-t border-line-subtle pt-2">
                <h2 className="px-2.5 pb-1 text-caption font-medium text-fg">Fill this form</h2>
                {fills.map((scenario) => (
                  <button
                    key={scenario.label}
                    type="button"
                    className={itemClass}
                    onClick={() => window.dispatchEvent(new CustomEvent('vt:fill', { detail: scenario.fill }))}
                  >
                    {scenario.label}
                  </button>
                ))}
              </section>
            )}

            <section className="mt-2 border-t border-line-subtle pt-2">
              <h2 className="px-2.5 pb-1 text-caption font-medium text-fg">Link states</h2>
              {MOCK_SCENARIOS.links.map((link) => (
                <Link key={link.to} to={link.to} className={itemClass} onClick={() => setOpen(false)}>
                  {link.label}
                </Link>
              ))}
            </section>

            <section className="mt-2 border-t border-line-subtle pt-2">
              <h2 className="px-2.5 pb-1 text-caption font-medium text-fg">Motion</h2>
              <div className="grid grid-cols-3 gap-1 px-1.5 pb-1.5" role="group" aria-label="Motion preference">
                {[
                  { value: null, label: 'System' },
                  { value: 'reduced', label: 'Reduced' },
                  { value: 'full', label: 'Full' },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={override === opt.value}
                    onClick={() => setOverride(opt.value)}
                    className={cn(
                      'h-8 rounded-sm text-caption ring-1 ring-inset ring-line transition-colors',
                      override === opt.value ? 'bg-ion-dim text-ion ring-ion/40' : 'text-fg-muted hover:bg-surface-hover',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="px-2.5 pb-1 text-caption text-fg-subtle">
                System prefers {systemReducedMotion ? 'reduced' : 'full'} motion.
              </p>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="dev-preview-panel"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-800/90 px-3.5 text-caption text-warning shadow-e2 ring-1 ring-inset ring-warning/30 backdrop-blur-md hover:ring-warning/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
      >
        <FlaskConical size={14} aria-hidden="true" />
        Preview states
      </button>
    </div>
  )
}
