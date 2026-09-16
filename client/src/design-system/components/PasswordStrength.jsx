import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'

const LEVELS = [
  { label: 'Too short', tone: 'text-fg-subtle', bar: 'bg-fg-disabled' },
  { label: 'Weak', tone: 'text-danger', bar: 'bg-danger' },
  { label: 'Fair', tone: 'text-warning', bar: 'bg-warning' },
  { label: 'Good', tone: 'text-ion', bar: 'bg-ion' },
  { label: 'Strong', tone: 'text-success', bar: 'bg-success' },
]

/**
 * Four-segment meter + requirement checklist. Every state is expressed with
 * text and an icon, not color alone. Bars fill with scaleX (no layout change).
 */
export function PasswordStrength({ id, score, checks, active }) {
  const level = LEVELS[score]

  const requirements = [
    { key: 'length', met: checks.length, label: 'At least 12 characters' },
    { key: 'personal', met: checks.personal, label: 'Does not contain your name or email' },
    { key: 'variety', met: checks.variety, label: 'Mix of cases, numbers or symbols (recommended)' },
  ]

  return (
    <div id={id} className="-mt-2 mb-4">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((segment) => (
            <span key={segment} className="h-1 overflow-hidden rounded-full bg-ink-600">
              <span
                className={cn(
                  'block h-full origin-left rounded-full transition-transform duration-[var(--duration-moderate)] ease-[var(--ease-enter)]',
                  level.bar,
                  score >= segment ? 'scale-x-100' : 'scale-x-0',
                )}
                style={{ transitionDelay: `${(segment - 1) * 40}ms` }}
              />
            </span>
          ))}
        </div>
        <p className={cn('eyebrow w-[5.5rem] shrink-0 whitespace-nowrap text-right tabular', active ? level.tone : 'text-fg-subtle')} aria-live="polite">
          <span className="sr-only">Password strength: </span>
          {active ? level.label : '—'}
        </p>
      </div>

      <ul className="mt-3 space-y-1.5" aria-label="Password requirements">
        {requirements.map((req) => (
          <li
            key={req.key}
            className={cn(
              'flex items-center gap-2 text-caption transition-colors duration-[var(--duration-base)]',
              req.met ? 'text-fg-muted' : 'text-fg-subtle',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-4 place-items-center rounded-full transition-[background-color,color] duration-[var(--duration-base)]',
                req.met ? 'bg-success/15 text-success' : 'bg-ink-600 text-fg-subtle',
              )}
            >
              {req.met ? <Check size={11} strokeWidth={3} /> : <Minus size={11} strokeWidth={3} />}
            </span>
            {req.label}
            <span className="sr-only">{req.met ? '— met' : '— not met'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
