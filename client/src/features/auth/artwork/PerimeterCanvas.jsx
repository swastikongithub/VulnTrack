import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, IcosahedronGeometry, Vector3 } from 'three'
import { sceneStore } from './sceneStore'
import { buildDust, buildLinks, buildPackets, buildShell, circlePoints, SHELL_RADIUS } from './scene/geometry'
import * as shaders from './scene/shaders'
import { createUniforms, STATUS_TARGETS } from './scene/uniforms'

const FOV = 35
const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180)
const VERIFY_PULSE_INTERVAL = 2.6

function geometryFrom(attributes) {
  const geometry = new BufferGeometry()
  for (const [name, [array, size]] of Object.entries(attributes)) {
    geometry.setAttribute(name, new BufferAttribute(array, size))
  }
  return geometry
}

function useAdditiveMaterial(uniforms, vertexShader, fragmentShader) {
  return useMemo(
    () => ({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
    [uniforms, vertexShader, fragmentShader],
  )
}

/* ───────────────────────── Scene parts ───────────────────────── */

function Surface({ uniforms, tier }) {
  const data = useMemo(() => {
    const shell = buildShell({ count: tier === 'low' ? 520 : 880 })
    const links = buildLinks(shell, { neighbours: 3, maxDistance: tier === 'low' ? 0.62 : 0.5 })
    const packets = buildPackets(shell, links, { count: tier === 'low' ? 22 : 40 })
    return {
      nodes: geometryFrom({
        position: [shell.positions, 3],
        aSeed: [shell.seeds, 1],
        aKind: [shell.kinds, 1],
      }),
      links: geometryFrom({ position: [links.linePositions, 3], aSeed: [links.lineSeeds, 1] }),
      packets: geometryFrom({
        position: [packets.starts, 3],
        aEnd: [packets.ends, 3],
        aSpeed: [packets.speeds, 1],
        aOffset: [packets.offsets, 1],
        aSeed: [packets.reveals, 1],
      }),
    }
  }, [tier])

  useEffect(() => () => Object.values(data).forEach((g) => g.dispose()), [data])

  const nodeMat = useAdditiveMaterial(uniforms, shaders.shellVertex, shaders.shellFragment)
  const linkMat = useAdditiveMaterial(uniforms, shaders.linkVertex, shaders.linkFragment)
  const packetMat = useAdditiveMaterial(uniforms, shaders.packetVertex, shaders.packetFragment)

  return (
    <>
      <lineSegments geometry={data.links} frustumCulled={false}>
        <shaderMaterial args={[linkMat]} />
      </lineSegments>
      <points geometry={data.nodes} frustumCulled={false}>
        <shaderMaterial args={[nodeMat]} />
      </points>
      <points geometry={data.packets} frustumCulled={false}>
        <shaderMaterial args={[packetMat]} />
      </points>
    </>
  )
}

function Core({ uniforms, coreRef }) {
  const edges = useMemo(() => new IcosahedronGeometry(0.36, 0), [])
  const coreMat = useMemo(
    () => ({
      uniforms,
      vertexShader: shaders.coreVertex,
      fragmentShader: shaders.coreFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
    [uniforms],
  )
  const glowMat = useAdditiveMaterial(uniforms, shaders.glowVertex, shaders.glowFragment)

  return (
    <group ref={coreRef}>
      <mesh>
        <sphereGeometry args={[0.24, 32, 32]} />
        <shaderMaterial args={[coreMat]} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[edges]} />
        <lineBasicMaterial color="#7cdcff" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
      </lineSegments>
      <mesh scale={2.6} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial args={[glowMat]} />
      </mesh>
    </group>
  )
}

function ScanPlane({ uniforms, scanRef }) {
  const mat = useAdditiveMaterial(uniforms, shaders.scanVertex, shaders.scanFragment)
  return (
    <mesh ref={scanRef} rotation-x={-Math.PI / 2} frustumCulled={false}>
      <circleGeometry args={[1, 96]} />
      <shaderMaterial args={[{ ...mat, side: 2 }]} />
    </mesh>
  )
}

function Orbits({ orbitsRef }) {
  const ring = useMemo(() => geometryFrom({ position: [circlePoints(SHELL_RADIUS * 1.42, 256), 3] }), [])
  const ticks = useMemo(() => geometryFrom({ position: [circlePoints(SHELL_RADIUS * 1.7, 120), 3] }), [])
  useEffect(
    () => () => {
      ring.dispose()
      ticks.dispose()
    },
    [ring, ticks],
  )

  return (
    <group ref={orbitsRef}>
      <group rotation={[1.18, 0.1, 0.38]}>
        <lineLoop geometry={ring}>
          <lineBasicMaterial color="#7cdcff" transparent opacity={0.16} blending={AdditiveBlending} depthWrite={false} />
        </lineLoop>
        <mesh name="satellite" position={[SHELL_RADIUS * 1.42, 0, 0]}>
          <sphereGeometry args={[0.028, 12, 12]} />
          <meshBasicMaterial color="#c9f1ff" />
        </mesh>
      </group>
      <group rotation={[1.72, -0.2, -0.62]}>
        <points geometry={ticks}>
          <pointsMaterial
            color="#a497ff"
            size={0.022}
            sizeAttenuation
            transparent
            opacity={0.5}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>
    </group>
  )
}

function Dust({ uniforms, tier, dustRef }) {
  const geometry = useMemo(() => {
    const dust = buildDust({ count: tier === 'low' ? 220 : 420 })
    return geometryFrom({ position: [dust.positions, 3], aSeed: [dust.seeds, 1] })
  }, [tier])
  useEffect(() => () => geometry.dispose(), [geometry])
  const mat = useAdditiveMaterial(uniforms, shaders.dustVertex, shaders.dustFragment)
  return (
    <points ref={dustRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial args={[mat]} />
    </points>
  )
}

/* ───────────────────────── Rig / state driver ───────────────────────── */

function Rig({ uniforms, running, refs }) {
  const { camera, invalidate } = useThree()
  const sim = useRef({
    time: 8.4,
    scanPhase: 1.1,
    spin: 0,
    energy: 0.3,
    contract: 0,
    scanSpeed: 1,
    dolly: 0,
    pointer: { x: 0, y: 0, tx: 0, ty: 0, active: 0, targetActive: 0 },
    lastPulseAt: -Infinity,
    nextVerifyPulse: 0,
    scanCssY: -1,
    edgeLight: null,
  })
  const scratch = useMemo(() => new Vector3(), [])

  // Pointer tracking (fine pointers only). Stores numbers; the frame loop smooths them.
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return undefined
    const p = sim.current.pointer
    const onMove = (event) => {
      p.tx = (event.clientX / window.innerWidth) * 2 - 1
      p.ty = -((event.clientY / window.innerHeight) * 2 - 1)
      p.targetActive = 1
    }
    const onLeave = (event) => {
      if (!event.relatedTarget) p.targetActive = 0
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerout', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onLeave)
    }
  }, [])

  // In on-demand mode (reduced motion / paused / offscreen), redraw on state change.
  useEffect(() => {
    if (running) return undefined
    let timer
    let lastErrorAt = sceneStore.getState().errorAt
    const unsubscribe = sceneStore.subscribe((s) => {
      invalidate()
      // Error tint decays over time — schedule a redraw to clear it
      if (s.errorAt !== lastErrorAt) {
        lastErrorAt = s.errorAt
        clearTimeout(timer)
        timer = setTimeout(() => invalidate(), 1450)
      }
    })
    const onResize = () => invalidate()
    window.addEventListener('resize', onResize)
    invalidate()
    return () => {
      unsubscribe()
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [running, invalidate])

  useFrame((state, rawDelta) => {
    const s = sceneStore.getState()
    const u = uniforms
    const m = sim.current
    const dt = Math.min(rawDelta, 1 / 20)
    const now = performance.now()
    const instant = !running
    const ease = (rate) => (instant ? 1 : 1 - Math.exp(-dt * rate))

    if (running) m.time += dt
    const t = m.time
    u.uTime.value = t

    // Status targets
    const target = STATUS_TARGETS[s.status] ?? STATUS_TARGETS.idle
    m.energy += (target.energy - m.energy) * ease(3.5)
    m.contract += (target.contract - m.contract) * ease(4)
    m.scanSpeed += (target.scanSpeed - m.scanSpeed) * ease(2.5)
    m.spin += (target.spin - m.spin) * ease(2)
    u.uEnergy.value = m.energy
    u.uContract.value = m.contract

    // Error impulse decays over ~1.3s
    const errorAge = (now - s.errorAt) / 1000
    u.uError.value = errorAge >= 0 && errorAge < 1.4 ? Math.exp(-errorAge * (instant ? 1.2 : 2.6)) : 0

    // Success resolves findings → verified
    const successTarget = s.status === 'success' || s.status === 'transition' || s.mode === 'session' ? 1 : 0
    u.uSuccess.value += (successTarget - u.uSuccess.value) * ease(2.2)

    // Mode: signup provisions the surface as the form fills; recovery re-keys (iris)
    const revealTarget = s.mode === 'signup' ? 0.38 + s.progress * 0.67 : 1.05
    u.uReveal.value += (revealTarget - u.uReveal.value) * ease(2.2)
    const rekeyTarget = s.mode === 'recovery' ? 1 : 0
    u.uRekey.value += (rekeyTarget - u.uRekey.value) * ease(2)

    // Pulses: explicit impulses + periodic handshake while verifying
    if (s.pulseAt !== m.lastPulseAt && now - s.pulseAt < 500) {
      m.lastPulseAt = s.pulseAt
      u.uPulseT.value = t
    }
    if (running && s.mode === 'verify' && s.status !== 'error' && t > m.nextVerifyPulse) {
      u.uPulseT.value = t
      m.nextVerifyPulse = t + VERIFY_PULSE_INTERVAL
    }

    // Scan plane sweeps the perimeter
    if (running) m.scanPhase += dt * m.scanSpeed * 0.9
    const scanY = Math.sin(m.scanPhase) * SHELL_RADIUS * 0.9
    u.uScan.value = scanY
    if (refs.scan.current) {
      const r = Math.sqrt(Math.max(SHELL_RADIUS * SHELL_RADIUS - scanY * scanY, 0.01)) * 1.08
      refs.scan.current.position.y = scanY
      refs.scan.current.scale.setScalar(r)
    }

    // Pointer (smoothed) → rotation parallax + lens
    const p = m.pointer
    const pointerEase = ease(3)
    p.x += (p.tx - p.x) * pointerEase
    p.y += (p.ty - p.y) * pointerEase
    p.active += (p.targetActive - p.active) * ease(2)
    const pointerOn = running ? 1 : 0
    u.uPointer.value.set(p.x, p.y)
    u.uPointerActive.value = p.active * pointerOn

    if (refs.shell.current) {
      if (running) refs.shell.current.rotation.y += dt * m.spin
      else if (refs.shell.current.rotation.y === 0) refs.shell.current.rotation.y = 0.6
      const tiltX = 0.2 - p.y * 0.2 * pointerOn
      const tiltZ = -0.12 + p.x * 0.08 * pointerOn
      refs.shell.current.rotation.x += (tiltX - refs.shell.current.rotation.x) * pointerEase
      refs.shell.current.rotation.z += (tiltZ - refs.shell.current.rotation.z) * pointerEase
    }
    if (refs.core.current) {
      const coreScale = 1 + u.uSuccess.value * 0.25 - m.contract * 0.12
      refs.core.current.scale.setScalar(coreScale)
      if (running) {
        refs.core.current.rotation.y -= dt * (0.3 + m.spin * 2)
        refs.core.current.rotation.x += dt * 0.17
      }
    }
    if (refs.orbits.current && running) {
      refs.orbits.current.rotation.y += dt * (0.035 + m.spin * 0.3) * (u.uRekey.value > 0.5 ? -1.6 : 1)
      const satellite = refs.orbits.current.getObjectByName('satellite')
      if (satellite) {
        const a = t * 0.45
        satellite.position.set(Math.cos(a) * SHELL_RADIUS * 1.42, 0, Math.sin(a) * SHELL_RADIUS * 1.42)
      }
    }
    if (refs.dust.current) {
      refs.dust.current.rotation.y = t * 0.012 - p.x * 0.1 * pointerOn
      refs.dust.current.rotation.x = p.y * 0.05 * pointerOn
    }

    // Camera: place the perimeter at the art anchor, dolly into the core on session transition
    const layout = s.layout
    const { width: W, height: H } = state.size
    u.uAspect.value = W / H
    u.uPixelRatio.value = state.viewport.dpr
    if (layout) {
      const dollyTarget = s.status === 'transition' ? 1 : 0
      m.dolly += (dollyTarget - m.dolly) * ease(1.6)
      const baseZ = (SHELL_RADIUS * H) / (2 * layout.radius * TAN_HALF_FOV)
      camera.position.z = baseZ * (1 - m.dolly * 0.62)
      const scrollShift = layout.pinned ? 0 : s.scroll * layout.anchorHeight * 0.55
      camera.setViewOffset(W, H, W / 2 - layout.cx, H / 2 - (layout.cy - scrollShift), W, H)
      camera.updateProjectionMatrix()
      u.uFade.value = layout.pinned ? 1 - m.dolly * 0.5 : Math.max(0, 1 - s.scroll * 1.15)

      // Drive the auth panel's edge light from the scan sweep. Written straight to that one
      // element's transform — never to :root custom properties, which would restyle the whole
      // document every frame.
      if (layout.pinned) {
        m.edgeLight ??= document.getElementById('scan-edge-light')
        if (m.edgeLight?.isConnected) {
          scratch.set(0, scanY, 0).project(camera)
          const y = Math.round(((1 - scratch.y) / 2) * H)
          if (Math.abs(y - m.scanCssY) >= 1) {
            m.scanCssY = y
            m.edgeLight.style.transform = `translate3d(0, ${y}px, 0) translateY(-50%)`
            m.edgeLight.style.opacity = (0.35 + m.energy * 0.65).toFixed(2)
          }
        } else {
          m.edgeLight = null
        }
      }
    }
  })

  return null
}

function Scene({ tier, running }) {
  const uniforms = useMemo(() => createUniforms(), [])
  const refs = {
    shell: useRef(null),
    core: useRef(null),
    scan: useRef(null),
    orbits: useRef(null),
    dust: useRef(null),
  }

  return (
    <>
      <Rig uniforms={uniforms} running={running} refs={refs} />
      <Dust uniforms={uniforms} tier={tier} dustRef={refs.dust} />
      <group ref={refs.shell} rotation={[0.2, 0, -0.12]}>
        <Surface uniforms={uniforms} tier={tier} />
        <Orbits orbitsRef={refs.orbits} />
      </group>
      <ScanPlane uniforms={uniforms} scanRef={refs.scan} />
      <Core uniforms={uniforms} coreRef={refs.core} />
    </>
  )
}

/**
 * The Perimeter — WebGL artwork for the auth experience.
 * `running=false` switches to on-demand rendering (reduced motion, paused,
 * scrolled offscreen) while still reflecting every state change.
 */
export default function PerimeterCanvas({ tier, running, onReady }) {
  const dpr = tier === 'low' ? [1, 1.5] : [1, 1.75]

  return (
    <Canvas
      flat
      dpr={dpr}
      frameloop={running ? 'always' : 'demand'}
      camera={{ fov: FOV, near: 0.1, far: 60, position: [0, 0, 10] }}
      gl={{ antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        requestAnimationFrame(() => onReady?.())
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Scene tier={tier} running={running} />
    </Canvas>
  )
}
