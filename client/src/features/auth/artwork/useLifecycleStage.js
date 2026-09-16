import { useEffect, useState } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { STAGE } from './lifecycle'
import { useSceneStore } from './sceneStore'

const CYCLE_MS = 3800

/**
 * Resolves the lifecycle stage shown by the HUD.
 * - idle: slowly narrates the lifecycle (stops when paused / reduced motion)
 * - loading: Verify · success & session: Close (lifecycle complete)
 */
export function useLifecycleStage() {
  const { reducedMotion } = useMotionPreference()
  const status = useSceneStore((s) => s.status)
  const mode = useSceneStore((s) => s.mode)
  const paused = useSceneStore((s) => s.paused)
  const [cycle, setCycle] = useState(0)

  const complete = status === 'success' || status === 'transition' || mode === 'session'
  const pinned = status === 'loading' ? STAGE.VERIFY : complete ? STAGE.CLOSE : null
  const cycling = pinned === null && !paused && !reducedMotion

  useEffect(() => {
    if (!cycling) return undefined
    const id = setInterval(() => {
      if (!document.hidden) setCycle((c) => c + 1)
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [cycling])

  const stage = pinned ?? cycle % 8
  // `turns` grows monotonically so the indicator always rotates forward
  const turns = pinned ?? cycle

  return { stage, turns, complete, error: status === 'error' }
}
