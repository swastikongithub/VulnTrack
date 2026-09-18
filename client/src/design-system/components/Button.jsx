import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { duration, ease, spring } from '../motion/tokens'
import { buttonBase as base, buttonSizes as sizes, buttonVariants as variants } from './buttonStyles'
import { Spinner } from './Spinner'

const MotionButton = motion.button

/**
 * Button
 * - `loading` keeps the button focusable but inert (aria-disabled) and swaps
 *   the label for `loadingLabel` so screen readers hear the change.
 * - `success` morphs into a confirmed state (used before navigation).
 * Width never changes between states: labels crossfade in a fixed grid cell.
 */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'lg',
    loading = false,
    success = false,
    loadingLabel,
    successLabel,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className,
    children,
    disabled,
    onClick,
    type = 'button',
    ...props
  },
  ref,
) {
  const busy = loading || success
  const state = success ? 'success' : loading ? 'loading' : 'idle'

  return (
    <MotionButton
      ref={ref}
      type={type}
      data-state={state}
      disabled={disabled}
      aria-disabled={busy || undefined}
      whileTap={busy || disabled ? undefined : { scale: 0.975 }}
      transition={spring.press}
      onClick={(event) => {
        if (busy) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    >
      <span className="grid place-items-center [grid-template-areas:'stack']">
        <AnimatePresence initial={false}>
          <motion.span
            key={state}
            className="inline-flex items-center gap-2 [grid-area:stack]"
            initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, filter: 'blur(2px)', transition: { duration: duration.fast, ease: ease.exit } }}
            transition={{ duration: duration.base, ease: ease.enter }}
          >
            {state === 'loading' && (
              <>
                <Spinner size={16} />
                <span>{loadingLabel ?? children}</span>
              </>
            )}
            {state === 'success' && (
              <>
                <Check aria-hidden="true" size={17} strokeWidth={2.4} />
                <span>{successLabel ?? children}</span>
              </>
            )}
            {state === 'idle' && (
              <>
                {leadingIcon}
                <span>{children}</span>
                {trailingIcon && (
                  <span className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-enter)] group-hover/button:translate-x-0.5">
                    {trailingIcon}
                  </span>
                )}
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </MotionButton>
  )
})
