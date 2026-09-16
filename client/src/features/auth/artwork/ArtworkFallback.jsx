import { useMemo } from 'react'
import { buildShell, KIND } from './scene/geometry'
import { useSceneStore } from './sceneStore'

/**
 * Static SVG rendition of the Perimeter for browsers without WebGL.
 * Uses the same seeded geometry, orthographically projected.
 */
export function ArtworkFallback() {
  const complete = useSceneStore((s) => s.status === 'success' || s.mode === 'session')

  const nodes = useMemo(() => {
    const shell = buildShell({ count: 420 })
    const tilt = 0.35
    const out = []
    for (let i = 0; i < shell.count; i++) {
      const x = shell.positions[i * 3]
      const y = shell.positions[i * 3 + 1]
      const z = shell.positions[i * 3 + 2]
      const yr = y * Math.cos(tilt) - z * Math.sin(tilt)
      const zr = y * Math.sin(tilt) + z * Math.cos(tilt)
      out.push({ x: (x / 1.7) * 100, y: (-yr / 1.7) * 100, front: zr > 0, kind: shell.kinds[i] })
    }
    return out
  }, [])

  return (
    <svg
      viewBox="-100 -100 200 200"
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: 'var(--art-cx)', top: 'var(--art-cy)', width: 'calc(var(--art-r) * 2.1)' }}
    >
      <circle r="10" fill="var(--color-ion)" opacity="0.12" />
      <circle r="4" fill="var(--color-ion)" opacity="0.7" />
      {nodes.map((n, i) => {
        const finding = n.kind !== KIND.ASSET
        const color = finding
          ? complete
            ? 'var(--color-success)'
            : n.kind === KIND.CRITICAL
              ? 'var(--color-sev-critical)'
              : 'var(--color-warning)'
          : 'var(--color-fg-muted)'
        return (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={finding ? 1.3 : 0.7}
            fill={color}
            opacity={n.front ? (finding ? 0.95 : 0.6) : 0.15}
          />
        )
      })}
    </svg>
  )
}
