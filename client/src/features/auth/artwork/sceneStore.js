import { createStore } from '@/lib/createStore'

/**
 * Shared state between the auth UI and the Perimeter artwork.
 * The WebGL loop reads it every frame via getState(); DOM layers subscribe
 * to narrow slices. UI code should only use the action helpers below.
 *
 * mode:   login | signup | recovery | verify | session
 * status: idle | focus | loading | error | success | transition
 */
export const sceneStore = createStore({
  mode: 'login',
  status: 'idle',
  /** 0..1 — signup form completion; drives how much of the surface is provisioned */
  progress: 0,
  /** performance.now() of the last error / pulse impulse */
  errorAt: -Infinity,
  pulseAt: -Infinity,
  /** user toggled "pause motion" */
  paused: false,
  /** 0..1 scroll progress past the art window (mobile / tablet only) */
  scroll: 0,
  /** measured by useArtLayout */
  layout: null,
})

export const sceneActions = {
  setMode: (mode) => sceneStore.setState({ mode, progress: 0 }),
  setStatus: (status) => sceneStore.setState({ status }),
  setProgress: (progress) => sceneStore.setState({ progress: Math.max(0, Math.min(1, progress)) }),
  error: () => sceneStore.setState({ status: 'error', errorAt: performance.now() }),
  pulse: () => sceneStore.setState({ pulseAt: performance.now() }),
  togglePaused: () => sceneStore.setState((s) => ({ paused: !s.paused })),
}

export const useSceneStore = sceneStore.useStore
