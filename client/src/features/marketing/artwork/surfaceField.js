import { mulberry32 } from '@/features/auth/artwork/scene/geometry'

/**
 * Procedural data for the landing-page artwork: one particle per asset, shown
 * in four states that follow what the product actually does with a record.
 *
 *   0 Unmapped    — a scattered, colourless cloud (systems nobody has recorded)
 *   1 Inventoried — the points settle onto one perimeter (a single inventory)
 *   2 Classified  — four tiers by business criticality; internet-facing points ringed
 *   3 Owned       — grouped into owning teams
 *
 * Units are "perimeter radii": the renderer scales them to pixels, so the same
 * data serves every viewport. Deterministic (seeded), so every visit and the
 * static fallback agree.
 */

export const STATES = ['Unmapped', 'Inventoried', 'Classified', 'Owned']

/** Criticality tiers, top to bottom. Ratios are illustrative, not real data. */
export const TIERS = [
  { key: 'critical', label: 'Critical', share: 0.14, y: 0.78, radius: 0.46 },
  { key: 'high', label: 'High', share: 0.24, y: 0.28, radius: 0.66 },
  { key: 'medium', label: 'Medium', share: 0.3, y: -0.22, radius: 0.84 },
  { key: 'low', label: 'Low', share: 0.32, y: -0.72, radius: 1.0 },
]

/** Share of points that are internet-facing (ringed from the Classified state on). */
export const EXPOSED_SHARE = 0.11

/** Owning teams (sample names) and their cluster centres, in perimeter radii. */
export const TEAMS = ['Payments', 'Platform', 'Identity', 'Data', 'Mobile'].map((name, i) => {
  const angle = -Math.PI / 2 + (i / 5) * Math.PI * 2 + Math.PI / 5
  return { name, x: Math.cos(angle) * 0.92, y: Math.sin(angle) * 0.86 }
})
export const TEAM_RADIUS = 0.27

/** Camera tilt (radians) applied to the rotating states — rings read as ellipses. */
export const TILT = 0.34

function tierOf(r) {
  let acc = 0
  for (let i = 0; i < TIERS.length; i++) {
    acc += TIERS[i].share
    if (r < acc) return i
  }
  return TIERS.length - 1
}

/** Uniform point in a unit ball. */
function ball(rand) {
  const u = rand() * 2 - 1
  const theta = rand() * Math.PI * 2
  const r = Math.cbrt(rand())
  const s = Math.sqrt(1 - u * u)
  return [Math.cos(theta) * s * r, u * r, Math.sin(theta) * s * r]
}

export function buildField({ count, seed = 20260918 }) {
  const rand = mulberry32(seed)
  const a = new Float32Array(count * 3)
  const b = new Float32Array(count * 3)
  const c = new Float32Array(count * 3)
  const d = new Float32Array(count * 3)
  const tier = new Float32Array(count)
  const exposed = new Float32Array(count)
  const team = new Float32Array(count)
  const seeds = new Float32Array(count)
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const s = rand()
    seeds[i] = s

    // 0 · Unmapped: a wide, uneven cloud with a few loose clumps.
    const clump = i % 7 === 0 ? 0.35 : 1
    const [bx, by, bz] = ball(rand)
    a[i * 3] = bx * 2.7 * clump + (i % 7 === 0 ? (rand() - 0.5) * 3 : 0)
    a[i * 3 + 1] = by * 1.45 * clump + (i % 7 === 0 ? (rand() - 0.5) * 1.6 : 0)
    a[i * 3 + 2] = bz * 1.2

    // 1 · Inventoried: Fibonacci sphere (even coverage), slightly jittered.
    const fy = 1 - (i / (count - 1)) * 2
    const ring = Math.sqrt(1 - fy * fy)
    const theta = golden * i
    const jitter = 1 + (rand() - 0.5) * 0.05
    b[i * 3] = Math.cos(theta) * ring * jitter
    b[i * 3 + 1] = fy * jitter
    b[i * 3 + 2] = Math.sin(theta) * ring * jitter

    // 2 · Classified: a band per criticality tier.
    const t = tierOf(rand())
    tier[i] = t
    const band = TIERS[t]
    const angle = rand() * Math.PI * 2
    const spread = band.radius * (1 + (rand() - 0.5) * 0.12)
    c[i * 3] = Math.cos(angle) * spread
    c[i * 3 + 1] = band.y + (rand() - 0.5) * 0.07
    c[i * 3 + 2] = Math.sin(angle) * spread

    exposed[i] = rand() < EXPOSED_SHARE ? 1 : 0

    // 3 · Owned: one compact cluster per team.
    const k = Math.floor(rand() * TEAMS.length)
    team[i] = k
    const [tx, ty, tz] = ball(rand)
    d[i * 3] = TEAMS[k].x + tx * TEAM_RADIUS
    d[i * 3 + 1] = TEAMS[k].y + ty * TEAM_RADIUS
    d[i * 3 + 2] = tz * TEAM_RADIUS
  }

  return { a, b, c, d, tier, exposed, team, seeds }
}

/** Guide rings: the perimeter (state 1) and one per tier (state 2), as line segments. */
export function buildGuides(segments = 128) {
  const rings = [{ radius: 1.12, y: 0, kind: 0 }, ...TIERS.map((t) => ({ radius: t.radius * 1.14, y: t.y, kind: 1 }))]
  const positions = new Float32Array(rings.length * segments * 2 * 3)
  const kinds = new Float32Array(rings.length * segments * 2)
  let p = 0
  let k = 0
  for (const ring of rings) {
    for (let i = 0; i < segments; i++) {
      for (const j of [i, i + 1]) {
        const angle = (j / segments) * Math.PI * 2
        positions[p++] = Math.cos(angle) * ring.radius
        positions[p++] = ring.y
        positions[p++] = Math.sin(angle) * ring.radius
        kinds[k++] = ring.kind
      }
    }
  }
  return { positions, kinds }
}

/**
 * Where the field sits on screen, in CSS pixels of the fixed layer. Desktop: right half, beside
 * the copy. Below 1024px: upper part of the viewport, behind the cards.
 */
export function layoutFor(width, height) {
  // Breakpoints come from the same media queries as the CSS (which include the
  // scrollbar); `width` is the canvas width, which doesn't.
  if (window.matchMedia('(min-width: 64rem)').matches) {
    return { cx: width * 0.7, cy: height * 0.53, radius: Math.min(width * 0.17, height * 0.3), labels: true }
  }
  if (window.matchMedia('(min-width: 40rem)').matches) {
    return { cx: width * 0.5, cy: height * 0.3, radius: Math.min(width * 0.25, height * 0.19), labels: true }
  }
  return { cx: width * 0.5, cy: height * 0.27, radius: Math.min(width * 0.32, height * 0.19), labels: false }
}
