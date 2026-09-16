import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { sceneActions } from '../artwork/sceneStore'

/**
 * Per-screen setup: document title, artwork mode, and focus management.
 * Focus moves to the screen heading on client-side navigation (not on first
 * load) so screen-reader users land at the start of the new content.
 */
export function useAuthScreen({ title, mode }) {
  const headingRef = useRef(null)
  const { key: locationKey } = useLocation()

  useEffect(() => {
    document.title = `${title} · VulnTrack`
  }, [title])

  useEffect(() => {
    sceneActions.setMode(mode)
    sceneActions.setStatus('idle')
  }, [mode])

  useEffect(() => {
    // React Router gives the initial entry the key "default"
    if (locationKey === 'default') return
    headingRef.current?.focus({ preventScroll: true })
  }, [locationKey])

  return headingRef
}

/** Seconds countdown (e.g. resend cooldown, rate-limit retry). */
export function useCountdown() {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (remaining <= 0) return undefined
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(id)
  }, [remaining])

  return [remaining, setRemaining]
}

export function formatSeconds(total) {
  const m = Math.floor(total / 60)
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

/**
 * Dev-only: the preview panel dispatches `vt:fill` to populate the current
 * form with a mock scenario.
 */
export function usePreviewFill(onFill) {
  const handler = useRef(onFill)
  useEffect(() => {
    handler.current = onFill
  })
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const listener = (event) => handler.current(event.detail)
    window.addEventListener('vt:fill', listener)
    return () => window.removeEventListener('vt:fill', listener)
  }, [])
}
