import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, Vector2 } from 'three'
import { buildField, buildGuides, layoutFor, TILT } from './surfaceField'
import { surfaceMotion } from './surfaceStore'

/*
 * Positions are morphed on the GPU: every point carries all four states as
 * attributes and `uProgress` (0–3) blends between them, with a per-point
 * stagger. The shader projects straight to pixels (no camera), so the layout
 * is the same numbers the DOM labels use.
 */

const COMMON = /* glsl */ `
  uniform float uProgress;
  uniform float uAngle;
  uniform float uTilt;
  uniform vec2 uCenter;
  uniform vec2 uResolution;
  uniform float uRadius;

  vec3 turn(vec3 p, float a, float t) {
    float c = cos(a), s = sin(a);
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    float ct = cos(t), st = sin(t);
    return vec3(p.x, ct * p.y - st * p.z, st * p.y + ct * p.z);
  }

  vec4 toClip(vec3 p) {
    vec2 px = uCenter + vec2(p.x, -p.y) * uRadius;
    return vec4(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
  }
`

const pointVertex = /* glsl */ `
  ${COMMON}
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aC;
  attribute vec3 aD;
  attribute float aTier;
  attribute float aExposed;
  attribute float aSeed;
  uniform float uTime;
  uniform float uDpr;
  uniform float uSize;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHalo;

  const vec3 GREY = vec3(0.49, 0.537, 0.612);
  const vec3 ION = vec3(0.486, 0.863, 1.0);
  const vec3 PALE = vec3(0.82, 0.93, 1.0);

  float stage(float i) {
    return smoothstep(0.0, 1.0, clamp((uProgress - i) * 1.3 - aSeed * 0.3, 0.0, 1.0));
  }

  vec3 tierColor(float t) {
    if (t < 0.5) return vec3(1.0, 0.31, 0.427);
    if (t < 1.5) return vec3(1.0, 0.541, 0.298);
    if (t < 2.5) return vec3(0.965, 0.761, 0.357);
    return vec3(0.498, 0.655, 1.0);
  }

  void main() {
    float s1 = stage(0.0);
    float s2 = stage(1.0);
    float s3 = stage(2.0);

    vec3 drift = vec3(sin(uTime * 0.35 + aSeed * 40.0), cos(uTime * 0.29 + aSeed * 25.0), 0.0) * 0.05;
    vec3 p = mix(aA + drift, aB, s1);
    p = mix(p, aC, s2);
    p = turn(p, uAngle, uTilt);
    // Team clusters don't rotate, so their labels stay put.
    p = mix(p, aD + drift * 0.3, s3);

    float front = clamp(p.z * 0.5 + 0.5, 0.0, 1.0);
    float halo = aExposed * s2;

    vColor = mix(mix(GREY, mix(ION, PALE, aSeed), s1), tierColor(aTier), s2);
    vAlpha = (0.42 + 0.48 * s1) * (0.35 + 0.65 * mix(front, 1.0, s3 * 0.6)) * uOpacity;
    vHalo = halo;

    gl_PointSize = uSize * (0.75 + 0.5 * front) * (1.0 + halo * 1.9) * uDpr;
    gl_Position = toClip(p);
  }
`

const pointFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHalo;
  const vec3 ION = vec3(0.486, 0.863, 1.0);

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = length(c);
    if (d > 1.0) discard;
    float r0 = mix(0.95, 0.32, vHalo);
    float core = 1.0 - smoothstep(r0 - 0.3, r0, d);
    float ring = vHalo * (1.0 - smoothstep(0.05, 0.13, abs(d - 0.8)));
    vec3 color = mix(vColor, ION, ring * (1.0 - core));
    gl_FragColor = vec4(color, max(core, ring * 0.85) * vAlpha);
  }
`

const guideVertex = /* glsl */ `
  ${COMMON}
  attribute float aKind;
  uniform float uOpacity;
  varying float vAlpha;

  float stage(float i) { return smoothstep(0.0, 1.0, clamp(uProgress - i, 0.0, 1.0)); }

  void main() {
    vec3 p = turn(position, uAngle, uTilt);
    float front = clamp(p.z * 0.5 + 0.5, 0.0, 1.0);
    float perimeter = stage(0.0) * (1.0 - stage(1.0)) * 0.34;
    float tiers = stage(1.0) * (1.0 - stage(2.0)) * 0.2;
    vAlpha = mix(perimeter, tiers, aKind) * (0.3 + 0.7 * front) * uOpacity;
    gl_Position = toClip(p);
  }
`

const guideFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.62, 0.86, 1.0, vAlpha);
  }
`

function createUniforms() {
  return {
    uProgress: { value: 0 },
    uAngle: { value: 0 },
    uTilt: { value: TILT },
    uTime: { value: 0 },
    uCenter: { value: new Vector2() },
    uResolution: { value: new Vector2(1, 1) },
    uRadius: { value: 200 },
    uDpr: { value: 1 },
    uSize: { value: 2.6 },
    uOpacity: { value: 1 },
  }
}

function useGeometry(build) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    for (const [name, [array, size]] of Object.entries(build())) g.setAttribute(name, new BufferAttribute(array, size))
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/** Per-frame uniform update (kept outside the component: uniforms are GPU state, not React state). */
function writeUniforms(u, state, progress, time) {
  const { width, height } = state.size
  const layout = layoutFor(width, height)
  u.uProgress.value = progress
  u.uTime.value = time
  u.uAngle.value = 0.6 + time * 0.08 + surfaceMotion.spin
  u.uCenter.value.set(layout.cx, layout.cy)
  u.uResolution.value.set(width, height)
  u.uRadius.value = layout.radius
  u.uDpr.value = state.viewport.dpr
  u.uSize.value = width < 640 ? 2.2 : 2.6
}

function Field({ count, running, reducedMotion }) {
  const [uniforms] = useState(createUniforms)
  const invalidate = useThree((s) => s.invalidate)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const sim = useRef({ time: 0, progress: reducedMotion ? 1 : 0, tiers: -1, teams: -1, tiersEl: null, teamsEl: null })

  const points = useGeometry(() => {
    const f = buildField({ count })
    return {
      position: [f.b, 3],
      aA: [f.a, 3],
      aB: [f.b, 3],
      aC: [f.c, 3],
      aD: [f.d, 3],
      aTier: [f.tier, 1],
      aExposed: [f.exposed, 1],
      aSeed: [f.seeds, 1],
    }
  })
  const guides = useGeometry(() => {
    const g = buildGuides()
    return { position: [g.positions, 3], aKind: [g.kinds, 1] }
  })

  const pointMaterial = useMemo(
    () => ({ uniforms, vertexShader: pointVertex, fragmentShader: pointFragment, transparent: true, depthWrite: false, depthTest: false }),
    [uniforms],
  )
  const guideMaterial = useMemo(
    () => ({ uniforms, vertexShader: guideVertex, fragmentShader: guideFragment, transparent: true, depthWrite: false, depthTest: false }),
    [uniforms],
  )

  // On-demand mode: draw once the canvas has its real size (the first request can
  // arrive before it does). Resizing the drawing buffer clears it after R3F's own
  // frame, so redraw again once the resize has settled.
  useEffect(() => {
    if (!width || !height) return undefined
    invalidate()
    const frame = requestAnimationFrame(() => invalidate())
    const timer = setTimeout(() => invalidate(), 120)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [width, height, invalidate])

  // Scroll handlers call this in on-demand mode.
  useEffect(() => {
    surfaceMotion.invalidate = invalidate
    const onResize = () => invalidate()
    window.addEventListener('resize', onResize)
    invalidate()
    return () => {
      surfaceMotion.invalidate = null
      window.removeEventListener('resize', onResize)
    }
  }, [invalidate])

  useFrame((state, rawDelta) => {
    const m = sim.current
    const dt = Math.min(rawDelta, 1 / 20)
    const target = Math.min(1, surfaceMotion.intro) + surfaceMotion.story
    const instant = !running
    m.progress += (target - m.progress) * (instant ? 1 : 1 - Math.exp(-dt * 4.5))
    if (running) m.time += dt

    writeUniforms(uniforms, state, m.progress, m.time)

    // DOM labels share the stage timing (written only when they change noticeably).
    const tiers = smooth(m.progress - 1.35) * (1 - smooth((m.progress - 2) * 2))
    const teams = smooth((m.progress - 2.45) * 1.8)
    const labels = surfaceMotion.labels
    if (labels?.tiers && (labels.tiers !== m.tiersEl || Math.abs(tiers - m.tiers) > 0.01)) {
      m.tiers = tiers
      m.tiersEl = labels.tiers
      labels.tiers.style.opacity = tiers.toFixed(3)
    }
    if (labels?.teams && (labels.teams !== m.teamsEl || Math.abs(teams - m.teams) > 0.01)) {
      m.teams = teams
      m.teamsEl = labels.teams
      labels.teams.style.opacity = teams.toFixed(3)
    }
  })

  return (
    <>
      <lineSegments geometry={guides} frustumCulled={false}>
        <shaderMaterial args={[guideMaterial]} />
      </lineSegments>
      <points geometry={points} frustumCulled={false}>
        <shaderMaterial args={[pointMaterial]} />
      </points>
    </>
  )
}

/**
 * Landing-page artwork. `running=false` switches to on-demand frames (reduced
 * motion, tab hidden, layer faded out) while still reflecting scroll state.
 */
export default function SurfaceCanvas({ tier, running, reducedMotion, onReady }) {
  const count = tier === 'low' ? 700 : 1400

  return (
    <Canvas
      flat
      dpr={tier === 'low' ? [1, 1.5] : [1, 1.75]}
      frameloop={running ? 'always' : 'demand'}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance', stencil: false, depth: false }}
      onCreated={({ gl, invalidate }) => {
        gl.setClearColor(0x000000, 0)
        invalidate()
        requestAnimationFrame(() => onReady?.())
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Field count={count} running={running} reducedMotion={reducedMotion} />
    </Canvas>
  )
}
