/**
 * Motion tokens — the single source of timing for Framer Motion and GSAP.
 * Mirrors the CSS custom properties in index.css (--duration-*, --ease-*).
 *
 * Principles (see docs/design-system/MASTER.md § Motion):
 *  - Enter decelerates, exit accelerates; exits run at ~60% of the enter duration.
 *  - Only transform / opacity / filter are animated. Never width, height, top, left.
 *  - Every animation is interruptible and never blocks input.
 */

export const duration = {
  instant: 0.1,
  fast: 0.16,
  base: 0.24,
  moderate: 0.36,
  slow: 0.56,
  scene: 1.2,
}

/** Cubic-bezier arrays for Framer Motion */
export const ease = {
  standard: [0.2, 0, 0, 1],
  enter: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
  emphasized: [0.7, 0, 0.2, 1],
}

/** Equivalent GSAP ease strings */
export const gsapEase = {
  standard: 'power2.out',
  enter: 'expo.out',
  exit: 'power2.in',
  emphasized: 'power3.inOut',
}

export const spring = {
  /** Press / release feedback on controls */
  press: { type: 'spring', stiffness: 520, damping: 32, mass: 0.6 },
  /** Shared-layout indicators (segmented control pill) */
  layout: { type: 'spring', stiffness: 380, damping: 34 },
}

/** Stagger between sibling items entering (30–50ms per item) */
export const stagger = {
  tight: 0.035,
  base: 0.05,
}

/** Directional distance for screen-level transitions, px */
export const travel = {
  screen: 20,
  element: 8,
  micro: 3,
}
