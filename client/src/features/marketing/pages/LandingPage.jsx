import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useLayoutEffect } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { SurfaceStage } from '../artwork/SurfaceStage'
import { requestSurfaceFrame, surfaceMotion, surfaceStore } from '../artwork/surfaceStore'
import { AccessSection } from '../components/AccessSection'
import { FinalCta, MarketingFooter } from '../components/Closing'
import { Hero } from '../components/Hero'
import { IdentifierPlayground } from '../components/IdentifierPlayground'
import { MarketingNav } from '../components/MarketingNav'
import { ProductPreview } from '../components/ProductPreview'
import { Roadmap } from '../components/Roadmap'
import { SecuritySpec } from '../components/SecuritySpec'
import { SurfaceStory } from '../components/SurfaceStory'

gsap.registerPlugin(ScrollTrigger)

/**
 * Artwork choreography that spans sections: the hero intro (Unmapped →
 * Inventoried), scroll-linked rotation, and the fade-out once the product
 * preview takes over. Everything writes to `surfaceMotion` — no React renders.
 */
function useSurfaceChoreography(reducedMotion) {
  useLayoutEffect(() => {
    surfaceMotion.story = 0
    surfaceMotion.spin = 0
    surfaceStore.setState({ visible: true })

    let intro = null
    if (reducedMotion) {
      surfaceMotion.intro = 1
    } else {
      surfaceMotion.intro = 0
      intro = gsap.to(surfaceMotion, { intro: 1, duration: 2.6, delay: 0.35, ease: 'power3.inOut' })
    }

    const spin = reducedMotion
      ? null
      : ScrollTrigger.create({
          start: 0,
          end: 'max',
          onUpdate: (self) => {
            surfaceMotion.spin = self.scroll() * 0.0006
          },
        })

    const fade = ScrollTrigger.create({
      trigger: '#preview',
      start: 'top 70%',
      end: 'top 15%',
      onUpdate: (self) => {
        const opacity = 1 - self.progress
        if (surfaceMotion.layer) surfaceMotion.layer.style.opacity = opacity.toFixed(3)
        surfaceStore.setState({ visible: opacity > 0.01 })
        requestSurfaceFrame()
      },
    })

    requestSurfaceFrame()
    const refresh = requestAnimationFrame(() => ScrollTrigger.refresh())

    return () => {
      cancelAnimationFrame(refresh)
      intro?.kill()
      spin?.kill()
      fade.kill()
      if (surfaceMotion.layer) surfaceMotion.layer.style.opacity = ''
    }
  }, [reducedMotion])
}

/**
 * Public marketing page at "/". Separate from the authenticated app: it only
 * reads the session status (to offer "Open workspace") and links into the
 * auth routes.
 */
export function LandingPage() {
  const { reducedMotion } = useMotionPreference()
  useSurfaceChoreography(reducedMotion)

  useEffect(() => {
    const previous = document.title
    document.title = 'VulnTrack — Asset inventory for security teams'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable fixed left-4 top-4 z-[var(--z-skiplink)] rounded-md bg-ion px-4 py-2 text-label text-on-ion"
      >
        Skip to content
      </a>
      <SurfaceStage />
      <MarketingNav />
      <main id="main" tabIndex={-1} className="relative z-[var(--z-content)] overflow-x-clip focus:outline-none">
        <Hero />
        <SurfaceStory />
        <ProductPreview />
        <IdentifierPlayground />
        <AccessSection />
        <SecuritySpec />
        <Roadmap />
        <FinalCta />
      </main>
      <div className="relative z-[var(--z-content)]">
        <MarketingFooter />
      </div>
    </>
  )
}
