import { useGSAP } from '@gsap/react'
import { motion } from 'framer-motion'
import { gsap } from 'gsap'
import { useEffect, useRef } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { duration, ease } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'
import { LIFECYCLE } from './lifecycle'
import { sceneStore, useSceneStore } from './sceneStore'
import { useLifecycleStage } from './useLifecycleStage'

const TICKS = 96
const STEP = 360 / LIFECYCLE.length

/** SVG arc path on a circle of radius r centred at (100,100); angles in degrees, 0 = top. */
function arc(r, from, to) {
  const toXY = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return [100 + Math.cos(rad) * r, 100 + Math.sin(rad) * r]
  }
  const [x1, y1] = toXY(from)
  const [x2, y2] = toXY(to)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

/**
 * Lifecycle HUD — a 2D instrument ring registered to the 3D perimeter.
 * Narrates the vulnerability lifecycle; locks to Verify while authenticating
 * and completes (all segments lit) on success. Decorative: aria-hidden.
 */
export function LifecycleHud() {
  const { reducedMotion } = useMotionPreference()
  const { stage, turns, complete, error } = useLifecycleStage()
  const pinned = useSceneStore((s) => s.layout?.pinned ?? false)
  const mode = useSceneStore((s) => s.mode)
  const rootRef = useRef(null)
  const parallaxRef = useRef(null)

  // Entrance: ring draws on, ticks and labels stagger in
  useGSAP(
    () => {
      if (reducedMotion) return
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
      tl.from('[data-hud="ring"]', { strokeDashoffset: 620, duration: 1.8 }, 0.2)
        .from('[data-hud="tick"]', { opacity: 0, duration: 0.5, stagger: { each: 0.008, from: 'start' } }, 0.3)
        .from('[data-hud="label"]', { opacity: 0, y: 6, duration: 0.7, stagger: 0.06 }, 0.7)
        .from('[data-hud="indicator"]', { opacity: 0, scale: 0.94, duration: 1 }, 1)
    },
    { scope: rootRef, dependencies: [pinned] },
  )

  // Mobile scroll parallax — mirrors the camera shift in PerimeterCanvas
  useEffect(() => {
    return sceneStore.subscribe((s) => {
      const el = parallaxRef.current
      if (!el || !s.layout) return
      if (s.layout.pinned) {
        el.style.transform = ''
        el.style.opacity = ''
        return
      }
      const shift = s.scroll * s.layout.anchorHeight * 0.55
      el.style.transform = `translate3d(0, ${-shift}px, 0)`
      el.style.opacity = String(Math.max(0, 1 - s.scroll * 1.3))
    })
  }, [])

  const accent = error ? 'var(--color-danger)' : complete ? 'var(--color-success)' : mode === 'recovery' ? 'var(--color-iris)' : 'var(--color-ion)'

  return (
    <div ref={parallaxRef} className="absolute inset-0 will-change-transform">
      <div
        ref={rootRef}
        className="absolute aspect-square -translate-x-1/2 -translate-y-1/2 [--hud-size:calc(var(--art-r)*2.55)] lg:[--hud-size:calc(var(--art-r)*3.05)]"
        style={{ left: 'var(--art-cx)', top: 'var(--art-cy)', width: 'var(--hud-size)' }}
      >
        {/* Static instrument ring */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
          <circle
            data-hud="ring"
            cx="100"
            cy="100"
            r="97"
            fill="none"
            stroke="var(--color-line-strong)"
            strokeWidth="0.35"
            strokeDasharray="620"
            strokeDashoffset="0"
          />
          {Array.from({ length: TICKS }, (_, i) => {
            const major = i % (TICKS / LIFECYCLE.length) === 0
            const a = ((i / TICKS) * 360 - 90) * (Math.PI / 180)
            const r1 = major ? 91.5 : 94.5
            return (
              <line
                key={i}
                data-hud="tick"
                x1={100 + Math.cos(a) * r1}
                y1={100 + Math.sin(a) * r1}
                x2={100 + Math.cos(a) * 97}
                y2={100 + Math.sin(a) * 97}
                stroke={major ? 'var(--color-fg-subtle)' : 'var(--color-line-strong)'}
                strokeWidth={major ? 0.6 : 0.35}
              />
            )
          })}
        </svg>

        {/* Slow counter-rotating inner reticle */}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 size-full animate-[spin_140s_linear_infinite_reverse] opacity-60"
        >
          <circle cx="100" cy="100" r="86" fill="none" stroke="var(--color-line)" strokeWidth="0.3" strokeDasharray="1 3.2" />
        </svg>

        {/* Completed lifecycle — all segments lit */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
          {LIFECYCLE.map((item, i) => (
            <motion.path
              key={item.name}
              d={arc(97, i * STEP + 3, (i + 1) * STEP - 3)}
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="1.1"
              strokeLinecap="round"
              initial={false}
              animate={{ opacity: complete ? 0.9 : 0, pathLength: complete ? 1 : 0 }}
              transition={{
                duration: complete ? duration.slow : duration.fast,
                ease: ease.enter,
                delay: complete ? i * 0.07 : 0,
              }}
            />
          ))}
        </svg>

        {/* Active stage indicator */}
        <motion.div
          data-hud="indicator"
          className="absolute inset-0"
          initial={false}
          animate={{ rotate: turns * STEP, opacity: complete ? 0 : 1 }}
          transition={{ duration: 1.1, ease: ease.emphasized }}
        >
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
            <defs>
              <filter id="hud-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.4" />
              </filter>
            </defs>
            <g style={{ color: accent }} className="transition-colors duration-500">
              <path d={arc(97, -STEP / 2 + 4, STEP / 2 - 4)} fill="none" stroke="currentColor" strokeWidth="2.4" filter="url(#hud-glow)" opacity="0.7" />
              <path d={arc(97, -STEP / 2 + 4, STEP / 2 - 4)} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              <circle cx="100" cy="1.6" r="1.5" fill="currentColor" />
            </g>
          </svg>
        </motion.div>

        {/* Stage labels — desktop only (space permitting) */}
        {pinned && (
          <div className="absolute inset-0 hidden lg:block">
            {LIFECYCLE.map((item, i) => {
              const angle = ((i * STEP - 90) * Math.PI) / 180
              const cos = Math.cos(angle)
              const sin = Math.sin(angle)
              const active = !complete && i === stage
              const align = cos > 0.3 ? '0%' : cos < -0.3 ? '-100%' : '-50%'
              return (
                <span
                  key={item.name}
                  data-hud="label"
                  className="absolute block"
                  style={{
                    left: `calc(50% + (var(--hud-size) / 2 + 18px) * ${cos.toFixed(4)})`,
                    top: `calc(50% + (var(--hud-size) / 2 + 18px) * ${sin.toFixed(4)})`,
                  }}
                >
                  <span
                    className={cn(
                      'eyebrow flex items-center gap-2 whitespace-nowrap transition-colors duration-500',
                      active ? 'text-fg' : complete ? 'text-success/80' : 'text-fg-subtle',
                    )}
                    style={{ transform: `translate(${align}, -50%)` }}
                  >
                    <span className={cn('tabular transition-colors duration-500', active ? 'text-ion' : 'opacity-60')}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {item.name}
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
