/**
 * The active Lenis instance (null when smooth scrolling is off: reduced
 * motion, touch devices). Lets in-page anchor links scroll through Lenis so
 * they don't fight its interpolation.
 */
let instance = null

export function setSmoothScrollInstance(lenis) {
  instance = lenis
}

export function getSmoothScroll() {
  return instance
}
