/**
 * Moves focus to a panel heading after the focused element was removed from the page
 * (e.g. the Remove button of a row that just disappeared).
 */
export function focusHeading(id) {
  // Runs after the dialog restores focus to its opener and the row's exit animation (240ms)
  // detaches that opener; only takes over if focus was actually lost.
  setTimeout(() => {
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected) document.getElementById(id)?.focus({ preventScroll: true })
  }, 320)
}
