import { motion } from 'framer-motion'
import { CircleAlert } from 'lucide-react'
import { forwardRef } from 'react'
import { duration, ease } from '../motion/tokens'

/**
 * Focusable summary shown after a failed submit with multiple errors.
 * Each item links to its field; inline field errors remain visible.
 */
export const ErrorSummary = forwardRef(function ErrorSummary({ errors, fieldLabels }, ref) {
  const entries = Object.entries(errors).filter(([, message]) => Boolean(message))
  if (entries.length < 2) return null

  return (
    <motion.div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.exit } }}
      transition={{ duration: duration.moderate, ease: ease.enter }}
      className="rounded-lg bg-danger-dim p-3.5 ring-1 ring-inset ring-danger/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
    >
      <p id="error-summary-title" className="flex items-center gap-2 text-label font-medium text-danger">
        <CircleAlert aria-hidden="true" size={17} />
        {entries.length} fields need attention
      </p>
      <ul className="mt-2 space-y-1 pl-[25px] text-caption">
        {entries.map(([field, message]) => (
          <li key={field}>
            <a
              href={`#${field}`}
              onClick={(event) => {
                event.preventDefault()
                document.getElementById(field)?.focus()
              }}
              className="text-fg-muted underline decoration-danger/50 underline-offset-3 hover:text-fg"
            >
              {fieldLabels[field]}: {message}
            </a>
          </li>
        ))}
      </ul>
    </motion.div>
  )
})
