import { lazy, Suspense, useEffect, useState } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { cn } from '@/lib/cn'
import { ErrorBoundary } from '@/lib/ErrorBoundary'
import { ArtworkFallback } from './ArtworkFallback'
import { LifecycleHud } from './LifecycleHud'
import { useSceneStore } from './sceneStore'
import { useLifecycleDriver } from './useLifecycleStage'

// three.js + R3F load in their own chunk; the form is interactive before it arrives
const PerimeterCanvas = lazy(() => import('./PerimeterCanvas'))

function detectWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function detectTier() {
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 768
  const cores = navigator.hardwareConcurrency || 4
  const memory = navigator.deviceMemory || 8
  return smallScreen || cores <= 4 || memory <= 4 ? 'low' : 'high'
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

/**
 * Fixed, full-viewport artwork layer behind the auth UI:
 * atmosphere gradients → WebGL perimeter → lifecycle HUD → film grain.
 * Entirely decorative (aria-hidden); the page describes it in text for SR users.
 */
export function ArtworkStage() {
  const { reducedMotion } = useMotionPreference()
  const paused = useSceneStore((s) => s.paused)
  const offscreen = useSceneStore((s) => s.scroll >= 0.98)
  const mode = useSceneStore((s) => s.mode)
  const status = useSceneStore((s) => s.status)
  const visible = usePageVisible()
  const [webgl] = useState(detectWebGL)
  const [tier] = useState(detectTier)
  const [ready, setReady] = useState(false)
  useLifecycleDriver()

  const running = !reducedMotion && !paused && !offscreen && visible

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[var(--z-scene)] overflow-hidden"
      data-mode={mode}
    >
      {/* Atmosphere: ion haze at the perimeter, iris haze for recovery, vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at var(--art-cx) var(--art-cy), rgb(124 220 255 / 0.09), transparent calc(var(--art-r) * 2.6)),' +
            'radial-gradient(ellipse 80% 60% at 15% 110%, rgb(40 60 110 / 0.35), transparent 70%)',
        }}
      />
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-1000',
          mode === 'recovery' ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          background: 'radial-gradient(circle at var(--art-cx) var(--art-cy), rgb(164 151 255 / 0.1), transparent calc(var(--art-r) * 2.8))',
        }}
      />
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-700',
          status === 'success' || mode === 'session' ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          background: 'radial-gradient(circle at var(--art-cx) var(--art-cy), rgb(74 227 165 / 0.08), transparent calc(var(--art-r) * 2.6))',
        }}
      />

      <div className={cn('absolute inset-0 transition-opacity duration-[1400ms]', ready ? 'opacity-100' : 'opacity-0')}>
        {webgl ? (
          <ErrorBoundary fallback={<FallbackReady onReady={() => setReady(true)} />}>
            <Suspense fallback={null}>
              <PerimeterCanvas tier={tier} running={running} onReady={() => setReady(true)} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <FallbackReady onReady={() => setReady(true)} />
        )}
      </div>

      <LifecycleHud />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.55))]" />
      <div className="grain absolute inset-0" />
    </div>
  )
}

function FallbackReady({ onReady }) {
  useEffect(() => onReady(), [onReady])
  return <ArtworkFallback />
}
