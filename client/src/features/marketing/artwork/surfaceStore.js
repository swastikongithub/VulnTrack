import { createStore } from '@/lib/createStore'

/**
 * Scroll → artwork bridge. Scroll handlers write plain numbers here every frame
 * (no React renders); the render loop reads them. `surfaceStore` holds only the
 * values React needs, which change rarely.
 */
export const surfaceMotion = {
  /** Hero intro, 0 → 1 (Unmapped → Inventoried). */
  intro: 0,
  /** Story scroll, 0 → 2 (Inventoried → Classified → Owned). */
  story: 0,
  /** Extra rotation from scrolling, radians. */
  spin: 0,
  /** Layer opacity: fades out after the story. */
  opacity: 1,
  /** Set by the canvas: request a frame in on-demand mode. */
  invalidate: null,
  /** DOM label groups the render loop fades in step with the field: { tiers, teams }. */
  labels: null,
  /** The fixed layer element; scroll handlers write its opacity directly. */
  layer: null,
}

export function requestSurfaceFrame() {
  surfaceMotion.invalidate?.()
}

/** `visible` false once the layer has faded out: rendering stops entirely. */
export const surfaceStore = createStore({ visible: true })
export const useSurfaceStore = surfaceStore.useStore
