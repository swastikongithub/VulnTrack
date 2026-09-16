import { useEffect } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { STAGE } from './lifecycle'
import { sceneStore, useSceneStore } from './sceneStore'

const CYCLE_MS = 3800

function resolvePinned(status, mode) {
  if (status === 'loading') return STAGE.VERIFY
  if (status === 'success' || status === 'transition' || mode === 'session') return STAGE.CLOSE
  return null
}

/**
 * Single clock that advances the narrated lifecycle stage. Mounted once
 * (ArtworkStage). Stops when paused, under reduced motion, in hidden tabs,
 * or while a status pins the stage.
 */
export function useLifecycleDriver() {
  const { reducedMotion } = useMotionPreference()
  const status = useSceneStore((s) => s.status)
  const mode = useSceneStore((s) => s.mode)
  const paused = useSceneStore((s) => s.paused)
  const cycling = resolvePinned(status, mode) === null && !paused && !reducedMotion

  useEffect(() => {
    if (!cycling) return undefined
    const id = setInterval(() => {
      if (!document.hidden) sceneStore.setState((s) => ({ cycle: s.cycle + 1 }))
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [cycling])
}

/**
 * Stage shown by HUD and caption.
 * idle: narrates the lifecycle · loading: Verify · success/session: Close (complete)
 */
export function useLifecycleStage() {
  const status = useSceneStore((s) => s.status)
  const mode = useSceneStore((s) => s.mode)
  const cycle = useSceneStore((s) => s.cycle)
  const pinned = resolvePinned(status, mode)

  return {
    stage: pinned ?? cycle % 8,
    // grows monotonically so the indicator always rotates forward
    turns: pinned === null ? cycle : cycle - (cycle % 8) + pinned + (pinned < cycle % 8 ? 8 : 0),
    complete: status === 'success' || status === 'transition' || mode === 'session',
    error: status === 'error',
  }
}
