import { getSmoothScroll } from '@/design-system/motion/smoothScrollInstance'

/** Height of the sticky marketing nav, plus breathing room. */
export const NAV_OFFSET = 72

/**
 * In-page navigation: scrolls through Lenis when it is active (so the two
 * don't fight), natively otherwise, then moves focus to the section heading
 * so keyboard and screen-reader users land where they asked to go.
 */
export function scrollToSection(id, { reducedMotion = false } = {}) {
  const section = document.getElementById(id)
  if (!section) return
  const focusTarget = section.querySelector('[data-section-heading]') ?? section
  const land = () => {
    if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1')
    focusTarget.focus({ preventScroll: true })
  }

  const lenis = getSmoothScroll()
  if (lenis && !reducedMotion) {
    lenis.scrollTo(section, { offset: -NAV_OFFSET, onComplete: land })
    return
  }
  const top = section.getBoundingClientRect().top + window.scrollY - NAV_OFFSET
  window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' })
  land()
}
