import { Color, Vector2 } from 'three'

/** Palette mirrors the CSS tokens in index.css (converted to linear by three.Color). */
export const PALETTE = {
  asset: '#8ea3c4',
  ion: '#7cdcff',
  iris: '#a497ff',
  finding: '#f6b25b',
  critical: '#ff5a72',
  verified: '#4ae3a5',
  danger: '#ff5a72',
}

export function createUniforms() {
  return {
    uTime: { value: 0 },
    uScan: { value: 0 },
    uEnergy: { value: 0.3 },
    uContract: { value: 0 },
    uError: { value: 0 },
    uSuccess: { value: 0 },
    uReveal: { value: 1.05 },
    uRekey: { value: 0 },
    uPulseT: { value: -100 },
    uFade: { value: 1 },
    uPixelRatio: { value: 1 },
    uAspect: { value: 1 },
    uPointer: { value: new Vector2(10, 10) },
    uPointerActive: { value: 0 },
    uAsset: { value: new Color(PALETTE.asset) },
    uIon: { value: new Color(PALETTE.ion) },
    uIris: { value: new Color(PALETTE.iris) },
    uFinding: { value: new Color(PALETTE.finding) },
    uCritical: { value: new Color(PALETTE.critical) },
    uVerified: { value: new Color(PALETTE.verified) },
    uDanger: { value: new Color(PALETTE.danger) },
  }
}

/**
 * Per-status animation targets. The render loop eases uniforms toward these,
 * which makes every state change interruptible by construction.
 */
export const STATUS_TARGETS = {
  idle: { energy: 0.3, contract: 0, scanSpeed: 1, spin: 0.07 },
  focus: { energy: 0.55, contract: 0, scanSpeed: 1.5, spin: 0.09 },
  loading: { energy: 1, contract: 1, scanSpeed: 3.6, spin: 0.55 },
  error: { energy: 0.6, contract: 0, scanSpeed: 1.2, spin: 0.05 },
  success: { energy: 0.9, contract: 0, scanSpeed: 1.2, spin: 0.16 },
  transition: { energy: 1, contract: 0.3, scanSpeed: 2, spin: 0.35 },
}
