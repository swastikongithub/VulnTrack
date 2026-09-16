import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { sceneActions } from '../artwork/sceneStore'

/**
 * Form state for auth screens.
 * - Validates a field on blur; once touched, re-validates as the user types
 *   so errors clear the moment they are fixed.
 * - On failed submit: marks all fields touched, focuses the error summary
 *   (2+ errors, when a summary is rendered) or the first invalid field.
 * - Keeps the artwork in sync: focus → energised, invalid submit → error impulse.
 *
 * - Server-side field errors (API VALIDATION_FAILED) render in the same field
 *   message rows via `applyServerErrors`, and clear when that field is edited.
 *
 * `validate(values)` returns { field: message | undefined } in field order.
 */
export function useAuthForm({ initialValues, validate, onSubmit, useSummary = false }) {
  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const summaryRef = useRef(null)
  const fieldRefs = useRef({})

  const allErrors = validate(values)
  const errors = Object.fromEntries(
    Object.entries(allErrors).map(([name, message]) => [
      name,
      (touched[name] || submitted ? message : undefined) ?? serverErrors[name],
    ]),
  )

  const setValue = useCallback((name, value) => setValues((prev) => ({ ...prev, [name]: value })), [])

  const register = (name) => ({
    id: name,
    name,
    value: values[name],
    error: errors[name],
    ref: (el) => {
      fieldRefs.current[name] = el
    },
    onChange: (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
      setValue(name, value)
      if (serverErrors[name]) setServerErrors(({ [name]: _cleared, ...rest }) => rest)
    },
    onFocus: () => {
      if (!submitting) sceneActions.setStatus('focus')
    },
    onBlur: (event) => {
      if (values[name] !== '' || submitted) setTouched((prev) => ({ ...prev, [name]: true }))
      const next = event.relatedTarget
      if (!submitting && !(next instanceof HTMLInputElement)) sceneActions.setStatus('idle')
    },
  })

  const handleSubmit = (event) => {
    event.preventDefault()
    if (submitting) return
    const invalid = Object.keys(allErrors).filter((name) => allErrors[name])
    // Commit the error UI synchronously so focus can land on it immediately
    // (works on repeat submits too, where no state actually changes).
    flushSync(() => setSubmitted(true))
    if (invalid.length > 0) {
      const summary = useSummary && invalid.length > 1 ? summaryRef.current : null
      ;(summary ?? fieldRefs.current[invalid[0]])?.focus()
      sceneActions.error()
      return
    }
    setSubmitting(true)
    sceneActions.setStatus('loading')
    Promise.resolve(onSubmit(values)).finally(() => setSubmitting(false))
  }

  /**
   * Shows API field errors for fields this form owns and focuses the first one.
   * Returns false when none of the fields belong to this form.
   */
  const applyServerErrors = useCallback(
    (fields = {}) => {
      const known = Object.keys(initialValues).filter((name) => fields[name])
      if (known.length === 0) return false
      flushSync(() => setServerErrors(Object.fromEntries(known.map((name) => [name, fields[name]]))))
      fieldRefs.current[known[0]]?.focus()
      return true
    },
    [initialValues],
  )

  const reset = useCallback(
    (next = initialValues) => {
      setValues(next)
      setTouched({})
      setSubmitted(false)
    },
    [initialValues],
  )

  return {
    values,
    setValue,
    setValues,
    errors,
    allErrors,
    submitted,
    submitting,
    register,
    handleSubmit,
    reset,
    summaryRef,
    applyServerErrors,
  }
}
