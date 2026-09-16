/**
 * Procedural geometry for the Perimeter artwork.
 *
 * Concept: an organization's attack surface rendered as a lattice of asset
 * nodes on a spherical perimeter around a protected core. A subset of nodes
 * carry findings (warm) — during a successful auth they resolve to verified.
 * Everything is generated deterministically from a seed so the artwork is
 * identical across reloads and between the WebGL and static fallback.
 */

export const SHELL_RADIUS = 1.6

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Node kinds */
export const KIND = { ASSET: 0, FINDING: 1, CRITICAL: 2 }

export function buildShell({ count, radius = SHELL_RADIUS, seed = 1337 }) {
  const rand = mulberry32(seed)
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const kinds = new Float32Array(count)
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const ring = Math.sqrt(1 - y * y)
    const theta = golden * i
    const r = radius * (1 + (rand() - 0.5) * 0.07)
    positions[i * 3] = Math.cos(theta) * ring * r
    positions[i * 3 + 1] = y * r
    positions[i * 3 + 2] = Math.sin(theta) * ring * r
    seeds[i] = rand()
    const roll = rand()
    kinds[i] = roll < 0.03 ? KIND.CRITICAL : roll < 0.095 ? KIND.FINDING : KIND.ASSET
  }

  return { positions, seeds, kinds, count }
}

/** Connect each node to its nearest neighbours → attack-surface mesh. */
export function buildLinks(shell, { neighbours = 3, maxDistance = 0.5 } = {}) {
  const { positions, seeds, count } = shell
  const seen = new Set()
  const pairs = []
  const maxSq = maxDistance * maxDistance

  for (let i = 0; i < count; i++) {
    const ix = positions[i * 3]
    const iy = positions[i * 3 + 1]
    const iz = positions[i * 3 + 2]
    const nearest = []
    for (let j = 0; j < count; j++) {
      if (i === j) continue
      const dx = positions[j * 3] - ix
      const dy = positions[j * 3 + 1] - iy
      const dz = positions[j * 3 + 2] - iz
      const d = dx * dx + dy * dy + dz * dz
      if (d > maxSq) continue
      if (nearest.length < neighbours) {
        nearest.push([d, j])
        nearest.sort((a, b) => a[0] - b[0])
      } else if (d < nearest[neighbours - 1][0]) {
        nearest[neighbours - 1] = [d, j]
        nearest.sort((a, b) => a[0] - b[0])
      }
    }
    for (const [, j] of nearest) {
      const key = i < j ? i * count + j : j * count + i
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push(i, j)
    }
  }

  const segments = pairs.length / 2
  const linePositions = new Float32Array(segments * 6)
  const lineSeeds = new Float32Array(segments * 2)
  for (let s = 0; s < segments; s++) {
    const a = pairs[s * 2]
    const b = pairs[s * 2 + 1]
    linePositions.set(positions.subarray(a * 3, a * 3 + 3), s * 6)
    linePositions.set(positions.subarray(b * 3, b * 3 + 3), s * 6 + 3)
    const reveal = Math.max(seeds[a], seeds[b])
    lineSeeds[s * 2] = reveal
    lineSeeds[s * 2 + 1] = reveal
  }

  return { linePositions, lineSeeds, pairs, segments }
}

/** Data packets travelling along random links. */
export function buildPackets(shell, links, { count = 36, seed = 7 } = {}) {
  const rand = mulberry32(seed)
  const starts = new Float32Array(count * 3)
  const ends = new Float32Array(count * 3)
  const speeds = new Float32Array(count)
  const offsets = new Float32Array(count)
  const reveals = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const s = Math.floor(rand() * links.segments)
    const a = links.pairs[s * 2]
    const b = links.pairs[s * 2 + 1]
    const flip = rand() > 0.5
    starts.set(shell.positions.subarray((flip ? b : a) * 3, (flip ? b : a) * 3 + 3), i * 3)
    ends.set(shell.positions.subarray((flip ? a : b) * 3, (flip ? a : b) * 3 + 3), i * 3)
    speeds[i] = 0.25 + rand() * 0.55
    offsets[i] = rand()
    reveals[i] = links.lineSeeds[s * 2]
  }

  return { starts, ends, speeds, offsets, reveals, count }
}

/** Distant dust for depth parallax. */
export function buildDust({ count, seed = 99 }) {
  const rand = mulberry32(seed)
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1
    const theta = rand() * Math.PI * 2
    const ring = Math.sqrt(1 - u * u)
    const r = 3.4 + Math.pow(rand(), 0.7) * 9
    positions[i * 3] = Math.cos(theta) * ring * r
    positions[i * 3 + 1] = u * r * 0.7
    positions[i * 3 + 2] = Math.sin(theta) * ring * r - 2
    seeds[i] = rand()
  }
  return { positions, seeds, count }
}

/** Evenly spaced points on a circle in the XZ plane. */
export function circlePoints(radius, segments) {
  const positions = new Float32Array(segments * 3)
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    positions[i * 3] = Math.cos(a) * radius
    positions[i * 3 + 1] = 0
    positions[i * 3 + 2] = Math.sin(a) * radius
  }
  return positions
}
