import { lazy, Suspense, useEffect, useState } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { PerimeterMotif } from '@/features/organization/components/PerimeterMotif'
import { cn } from '@/lib/cn'
import { ErrorBoundary } from '@/lib/ErrorBoundary'
import { layoutFor, TEAM_RADIUS, TEAMS, TIERS, TILT } from './surfaceField'
import { surfaceMotion, useSurfaceStore } from './surfaceStore'

// three.js + R3F load in their own chunk; the page is readable and interactive before it arrives.
const SurfaceCanvas = lazy(() => import('./SurfaceCanvas'))

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

/** Size of the fixed layer (viewport minus scrollbar), updated at most once per frame. */
const measure = () => ({ width: document.documentElement.clientWidth, height: window.innerHeight })

function useViewport() {
  const [size, setSize] = useState(measure)
  useEffect(() => {
    let frame = 0
    const onResize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSize(measure()))
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return size
}

/** Labels that name what the field is showing. Faded by the render loop, in step with the morph. */
function FieldLabels({ layout }) {
  const { cx, cy, radius } = layout
  const lean = Math.cos(TILT)
  return (
    <>
      <div
        ref={(el) => {
          surfaceMotion.labels = { ...surfaceMotion.labels, tiers: el }
        }}
        className="absolute inset-0"
        style={{ opacity: 0 }}
      >
        {TIERS.map((tier) => (
          <div
            key={tier.key}
            className="absolute flex items-center gap-2"
            style={{ left: cx + tier.radius * 1.14 * radius + 6, top: cy - tier.y * lean * radius, transform: 'translateY(-50%)' }}
          >
            <span className="h-px w-6 bg-line-strong" />
            <span className={cn('eyebrow', `text-sev-${tier.key}`)}>{tier.label}</span>
          </div>
        ))}
        <div
          className="absolute flex items-center gap-2 text-caption text-fg-muted"
          style={{ left: cx - radius * 1.14, top: cy + radius * 1.18, transform: 'translateY(-50%)' }}
        >
          <span className="size-2.5 rounded-full ring-[1.5px] ring-ion" />
          Internet-facing
        </div>
      </div>
      <div
        ref={(el) => {
          surfaceMotion.labels = { ...surfaceMotion.labels, teams: el }
        }}
        className="absolute inset-0"
        style={{ opacity: 0 }}
      >
        {TEAMS.map((team) => (
          <span
            key={team.name}
            className="eyebrow absolute whitespace-nowrap rounded-sm bg-ink-950/70 px-1.5 py-0.5 text-fg-muted"
            style={{
              left: cx + team.x * radius,
              top: cy - team.y * radius + (team.y > 0 ? -1 : 1) * (TEAM_RADIUS * radius + 16),
              transform: 'translate(-50%, -50%)',
            }}
          >
            {team.name}
          </span>
        ))}
      </div>
    </>
  )
}

/**
 * Fixed artwork layer behind the hero and the product story. Decorative
 * (aria-hidden): the story copy says in words what each state shows.
 * Stops rendering once it has faded out below the story.
 */
export function SurfaceStage() {
  const { reducedMotion } = useMotionPreference()
  const visible = useSurfaceStore((s) => s.visible)
  const pageVisible = usePageVisible()
  const viewport = useViewport()
  const [webgl] = useState(detectWebGL)
  const [tier] = useState(detectTier)
  const [ready, setReady] = useState(false)
  const layout = layoutFor(viewport.width, viewport.height)
  const running = !reducedMotion && visible && pageVisible

  return (
    <div
      ref={(el) => {
        surfaceMotion.layer = el
      }}
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 z-[var(--z-scene)] overflow-hidden', !visible && 'invisible')}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(circle at ${layout.cx}px ${layout.cy}px, rgb(124 220 255 / 0.075), transparent ${layout.radius * 2.4}px),` +
            'radial-gradient(ellipse 70% 50% at 10% 105%, rgb(40 60 110 / 0.3), transparent 70%)',
        }}
      />

      <div className={cn('absolute inset-0 transition-opacity duration-[1400ms]', ready ? 'opacity-100' : 'opacity-0')}>
        {webgl ? (
          <ErrorBoundary fallback={<Fallback layout={layout} onReady={() => setReady(true)} />}>
            <Suspense fallback={null}>
              <SurfaceCanvas tier={tier} running={running} reducedMotion={reducedMotion} onReady={() => setReady(true)} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <Fallback layout={layout} onReady={() => setReady(true)} />
        )}
      </div>

      {webgl && layout.labels && <FieldLabels layout={layout} />}

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.5))]" />
      <div className="grain absolute inset-0" />
    </div>
  )
}

function Fallback({ layout, onReady }) {
  useEffect(() => onReady(), [onReady])
  const size = layout.radius * 2.6
  return (
    <PerimeterMotif
      className="absolute opacity-80"
      style={{ left: layout.cx - size / 2, top: layout.cy - size / 2, width: size, height: size }}
    />
  )
}
