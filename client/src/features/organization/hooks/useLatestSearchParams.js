import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'

/**
 * useSearchParams, with writes that always build on the latest URL.
 *
 * React Router's `setSearchParams` (including its functional form) starts
 * from the params of the current render. Two writes before the next render —
 * "Clear filters" then a filter change in quick succession — make the second
 * write start from stale params and put the cleared values back. Here each
 * write records what it wrote; the next write builds on that until the router
 * has caught up.
 *
 *   const [params, write] = useLatestSearchParams()
 *   write((latest) => nextParams(latest), { replace: true })
 *   write(new URLSearchParams())
 */
export function useLatestSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const pending = useRef(null)

  // The router has delivered what we last wrote: nothing is pending any more.
  useEffect(() => {
    if (pending.current && pending.current.toString() === searchParams.toString()) pending.current = null
  }, [searchParams])

  const write = useCallback(
    (next, options) => {
      const base = new URLSearchParams(pending.current ?? searchParams)
      const params = new URLSearchParams(typeof next === 'function' ? next(base) : next)
      pending.current = params
      setSearchParams(params, options)
    },
    [searchParams, setSearchParams],
  )

  return [searchParams, write]
}
