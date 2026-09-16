import { MotionConfig } from 'framer-motion'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'
const STORAGE_KEY = 'vt:motion-override'

const MotionPreferenceContext = createContext({
  reducedMotion: false,
  systemReducedMotion: false,
  override: null,
  setOverride: () => {},
})

function readOverride() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'reduced' || value === 'full' ? value : null
  } catch {
    return null
  }
}

/**
 * Resolves the effective motion preference from the OS setting, with an
 * optional in-app override (used by the dev preview panel for testing).
 * Every JS animation system (Framer, GSAP, Lenis, WebGL) reads from here.
 */
export function MotionPreferenceProvider({ children }) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )
  const [override, setOverrideState] = useState(readOverride)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (event) => setSystemReducedMotion(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const setOverride = useCallback((value) => {
    setOverrideState(value)
    try {
      if (value) window.localStorage.setItem(STORAGE_KEY, value)
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* storage unavailable — keep in-memory override */
    }
  }, [])

  const reducedMotion = override ? override === 'reduced' : systemReducedMotion

  useEffect(() => {
    const root = document.documentElement
    if (override === 'reduced') root.dataset.motion = 'reduced'
    else delete root.dataset.motion
  }, [override])

  const value = useMemo(
    () => ({ reducedMotion, systemReducedMotion, override, setOverride }),
    [reducedMotion, systemReducedMotion, override, setOverride],
  )

  return (
    <MotionPreferenceContext.Provider value={value}>
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>{children}</MotionConfig>
    </MotionPreferenceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMotionPreference() {
  return useContext(MotionPreferenceContext)
}
