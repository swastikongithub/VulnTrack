import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { useEffect } from 'react'
import { useMotionPreference } from './MotionPreferenceProvider'

gsap.registerPlugin(ScrollTrigger)

/**
 * Lenis smooth scrolling, driven by the GSAP ticker so ScrollTrigger and
 * Lenis share one frame clock. Disabled entirely under reduced motion and on
 * touch devices (native momentum scrolling is already correct there).
 */
export function SmoothScroll() {
  const { reducedMotion } = useMotionPreference()

  useEffect(() => {
    if (reducedMotion) return undefined
    if (window.matchMedia('(pointer: coarse)').matches) return undefined

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => 1 - Math.pow(1 - t, 4),
      smoothWheel: true,
      syncTouch: false,
    })

    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [reducedMotion])

  return null
}
