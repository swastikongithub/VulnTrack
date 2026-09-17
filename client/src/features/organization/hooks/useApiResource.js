import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTH_ERROR } from '@/services/auth/authErrors'
import { sessionActions } from '@/features/auth/sessionStore'

/** A 401 from any organization call means the server session is gone. */
export function handleSessionLoss(error) {
  if (error?.code === AUTH_ERROR.UNAUTHENTICATED) sessionActions.expire()
}

/**
 * Loads data for `key` (refetching when the key changes, e.g. after an
 * organization switch). `reload()` shows the loading state again;
 * `reload({ quiet: true })` refreshes in the background, keeping current data.
 * `mutate(fn)` applies an optimistic or server-returned local update.
 */
export function useApiResource(loader, key) {
  const [state, setState] = useState({ key: null, status: 'loading', data: null, error: null })
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)

  useEffect(() => {
    loaderRef.current = loader
  })

  useEffect(() => {
    let active = true
    loaderRef.current().then(
      (data) => {
        if (active) setState({ key, status: 'ready', data, error: null })
      },
      (error) => {
        if (!active) return
        handleSessionLoss(error)
        setState((prev) => ({ key, status: 'error', data: prev.key === key ? prev.data : null, error }))
      },
    )
    return () => {
      active = false
    }
  }, [key, nonce])

  const reload = useCallback(({ quiet = false } = {}) => {
    if (!quiet) setState((prev) => ({ ...prev, status: 'loading', error: null }))
    setNonce((n) => n + 1)
  }, [])

  const mutate = useCallback((update) => setState((prev) => ({ ...prev, data: update(prev.data) })), [])

  const stale = state.key !== key
  return {
    status: stale ? 'loading' : state.status,
    data: stale ? null : state.data,
    error: stale ? null : state.error,
    reload,
    mutate,
  }
}
