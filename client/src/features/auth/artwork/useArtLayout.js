import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useLayoutEffect } from 'react'
import { sceneStore } from './sceneStore'

gsap.registerPlugin(ScrollTrigger)

const DESKTOP = '(min-width: 64rem)'
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

/**
 * Registers the artwork to its layout anchor.
 * Desktop (≥1024): anchor is the sticky left column — perimeter centred in it.
 * Mobile/tablet: anchor is the top art window — perimeter sits in it and
 * parallaxes away as the form sheet scrolls up (GSAP ScrollTrigger scrub).
 *
 * Writes --art-cx / --art-cy / --art-r for DOM layers and `layout` for WebGL.
 */
export function useArtLayout(anchorRef) {
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return undefined
    const root = document.documentElement

    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = anchor.getBoundingClientRect()
        const pinned = window.matchMedia(DESKTOP).matches
        const top = pinned ? rect.top : rect.top + window.scrollY
        const cx = rect.left + rect.width / 2
        const minSide = Math.min(rect.width, rect.height)
        let cy = top + rect.height / 2
        let radius
        if (pinned) {
          // leave room for the lifecycle labels around the ring
          // HUD ring = radius × 1.525; labels need ~130px beyond it on each side
          const fitWidth = (rect.width / 2 - 130) / 1.525
          radius = clamp(Math.min(rect.width * 0.2, rect.height * 0.22, fitWidth), 96, 250)
          cy -= rect.height * 0.02
        } else {
          radius = clamp(minSide * 0.27, 64, 124)
          cy += 18
        }

        root.style.setProperty('--art-cx', `${cx.toFixed(1)}px`)
        root.style.setProperty('--art-cy', `${cy.toFixed(1)}px`)
        root.style.setProperty('--art-r', `${radius.toFixed(1)}px`)
        sceneStore.setState({
          layout: { cx, cy, radius, pinned, anchorHeight: rect.height },
        })
        ScrollTrigger.refresh()
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(anchor)
    window.addEventListener('resize', measure)

    // Mobile/tablet: scroll progress past the art window
    const mm = gsap.matchMedia()
    mm.add('(max-width: 63.999rem)', () => {
      const trigger = ScrollTrigger.create({
        trigger: anchor,
        start: 'top top',
        end: 'bottom top',
        onUpdate: (self) => sceneStore.setState({ scroll: self.progress }),
      })
      return () => {
        trigger.kill()
        sceneStore.setState({ scroll: 0 })
      }
    })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      mm.revert()
    }
  }, [anchorRef])
}
