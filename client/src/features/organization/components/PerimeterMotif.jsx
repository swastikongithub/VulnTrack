/**
 * Static line-art echo of the Perimeter artwork for product surfaces: rings,
 * tick marks and a few boundary nodes. No animation, no WebGL — atmosphere
 * only (aria-hidden by the caller's container).
 */
const TICKS = Array.from({ length: 72 }, (_, i) => i)
const NODES = [
  { angle: 32, r: 250, tone: 'var(--color-ion)' },
  { angle: 118, r: 250, tone: 'var(--color-fg-subtle)' },
  { angle: 204, r: 250, tone: 'var(--color-success)' },
  { angle: 287, r: 250, tone: 'var(--color-fg-subtle)' },
  { angle: 76, r: 180, tone: 'var(--color-iris)' },
  { angle: 250, r: 180, tone: 'var(--color-fg-subtle)' },
]

export function PerimeterMotif({ className, style }) {
  return (
    <svg viewBox="-320 -320 640 640" className={className} style={style} fill="none">
      <circle r="250" stroke="var(--color-line)" strokeWidth="1" />
      <circle r="180" stroke="var(--color-line-subtle)" strokeWidth="1" strokeDasharray="2 6" />
      <circle r="110" stroke="var(--color-line-subtle)" strokeWidth="1" />
      <ellipse rx="300" ry="96" transform="rotate(-18)" stroke="rgb(124 220 255 / 0.10)" strokeWidth="1" />
      {TICKS.map((i) => {
        const a = (i / TICKS.length) * Math.PI * 2
        const inner = i % 6 === 0 ? 262 : 266
        return (
          <line
            key={i}
            x1={Math.cos(a) * inner}
            y1={Math.sin(a) * inner}
            x2={Math.cos(a) * 272}
            y2={Math.sin(a) * 272}
            stroke={i % 6 === 0 ? 'rgb(124 220 255 / 0.28)' : 'var(--color-line)'}
            strokeWidth="1"
          />
        )
      })}
      {NODES.map((node) => {
        const a = (node.angle * Math.PI) / 180
        return <circle key={`${node.angle}-${node.r}`} cx={Math.cos(a) * node.r} cy={Math.sin(a) * node.r} r="3" fill={node.tone} opacity="0.7" />
      })}
      <circle r="5" fill="var(--color-ion)" opacity="0.5" />
      <circle r="18" stroke="rgb(124 220 255 / 0.18)" strokeWidth="1" />
    </svg>
  )
}
