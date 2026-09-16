import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { forwardRef, useState } from 'react'
import { IconButton } from './IconButton'
import { TextField } from './TextField'

/**
 * PasswordField — TextField with a show/hide toggle and Caps Lock detection.
 * Paste and password managers are always allowed (WCAG 2.2 accessible authentication).
 */
export const PasswordField = forwardRef(function PasswordField(
  { onKeyDown, onKeyUp, onBlur, warning, error, hint, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)

  const detectCaps = (event) => {
    if (typeof event.getModifierState === 'function') {
      setCapsLock(event.getModifierState('CapsLock'))
    }
  }

  return (
    <TextField
      ref={ref}
      type={visible ? 'text' : 'password'}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      leadingIcon={<LockKeyhole size={17} strokeWidth={1.75} />}
      error={error}
      warning={warning ?? (capsLock && !error ? 'Caps Lock is on' : undefined)}
      hint={hint}
      onKeyDown={(event) => {
        detectCaps(event)
        onKeyDown?.(event)
      }}
      onKeyUp={(event) => {
        detectCaps(event)
        onKeyUp?.(event)
      }}
      onBlur={(event) => {
        setCapsLock(false)
        onBlur?.(event)
      }}
      trailing={
        <IconButton
          label="Show password"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          aria-controls={props.id}
        >
          {visible ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
        </IconButton>
      }
      {...props}
    />
  )
})
