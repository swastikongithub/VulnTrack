/**
 * GLSL for the Perimeter artwork. All materials share one uniforms object
 * (see uniforms.js) so state changes are written once per frame.
 *
 * Color math happens in linear space; `colorspace_fragment` encodes to sRGB.
 */

const common = /* glsl */ `
  uniform float uTime;
  uniform float uScan;
  uniform float uEnergy;
  uniform float uContract;
  uniform float uError;
  uniform float uSuccess;
  uniform float uReveal;
  uniform float uRekey;
  uniform float uPulseT;
  uniform float uFade;
  uniform float uPixelRatio;
  uniform float uAspect;
  uniform vec2 uPointer;
  uniform float uPointerActive;
`

const colors = /* glsl */ `
  uniform vec3 uAsset;
  uniform vec3 uIon;
  uniform vec3 uIris;
  uniform vec3 uFinding;
  uniform vec3 uCritical;
  uniform vec3 uVerified;
  uniform vec3 uDanger;
`

/* Shared vertex logic: breathing, contraction, error shiver, reveal, scan, pulse, pointer lens */
const displace = /* glsl */ `
  vec3 displaced(vec3 p, float seed) {
    float breathe = sin(uTime * 0.7 + seed * 6.2831) * 0.012;
    vec3 q = p * (1.0 + breathe) * mix(1.0, 0.88, uContract);
    q += normalize(p) * sin(uTime * 38.0 + seed * 91.0) * 0.035 * uError;
    return q;
  }
  float scanBand(float worldY) {
    return 1.0 - smoothstep(0.0, 0.2, abs(worldY - uScan));
  }
  float pulseBand(vec3 worldP) {
    float age = uTime - uPulseT;
    float radius = age * 2.4;
    float band = 1.0 - smoothstep(0.0, 0.28, abs(length(worldP) - radius));
    return band * (1.0 - smoothstep(0.2, 1.5, age)) * step(0.0, age);
  }
  float pointerLens(vec4 clip) {
    vec2 ndc = clip.xy / clip.w;
    vec2 d = (ndc - uPointer) * vec2(uAspect, 1.0);
    return (1.0 - smoothstep(0.0, 0.32, length(d))) * uPointerActive;
  }
`

export const shellVertex = /* glsl */ `
  ${common}
  ${displace}
  attribute float aSeed;
  attribute float aKind;
  varying float vKind;
  varying float vSeed;
  varying float vScan;
  varying float vPulse;
  varying float vLens;
  varying float vAlpha;

  void main() {
    vec3 p = displaced(position, aSeed);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;

    float reveal = smoothstep(aSeed - 0.06, aSeed + 0.02, uReveal);
    vScan = scanBand(world.y);
    vPulse = pulseBand(world.xyz);
    vLens = pointerLens(gl_Position);

    vec3 n = normalize((viewMatrix * vec4(normalize(world.xyz), 0.0)).xyz);
    float facing = n.z * 0.5 + 0.5;

    float size = aKind > 1.5 ? 6.2 : aKind > 0.5 ? 4.8 : 2.8;
    size *= 1.0 + vScan * 0.9 + vLens * 0.9 + vPulse * 1.1 + uSuccess * 0.25;
    gl_PointSize = size * uPixelRatio * (8.5 / -mv.z) * reveal;

    vAlpha = mix(0.18, 1.0, facing) * reveal * uFade;
    vKind = aKind;
    vSeed = aSeed;
  }
`

export const shellFragment = /* glsl */ `
  ${common}
  ${colors}
  varying float vKind;
  varying float vSeed;
  varying float vScan;
  varying float vPulse;
  varying float vLens;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float disc = smoothstep(0.5, 0.0, d);
    float hot = smoothstep(0.18, 0.0, d);
    float shape = disc * disc * 0.8 + hot * 0.9;

    vec3 asset = mix(uAsset, uIris, uRekey * 0.65);
    vec3 col = asset;
    float intensity = 0.42 + uEnergy * 0.25;

    if (vKind > 0.5) {
      vec3 finding = vKind > 1.5 ? uCritical : uFinding;
      finding = mix(finding, uDanger, uError);
      col = mix(finding, uVerified, uSuccess);
      float beat = 0.65 + 0.35 * sin(uTime * (vKind > 1.5 ? 3.2 : 2.2) + vSeed * 40.0);
      intensity = mix(beat, 1.0, uSuccess) * 1.25;
    } else {
      col = mix(col, uIon, clamp(vScan * 0.85 + vLens * 0.6 + vPulse * 0.8, 0.0, 1.0));
      col = mix(col, uVerified, uSuccess * 0.35);
    }

    intensity += vScan * 0.9 + vLens * 0.7 + vPulse * 1.0;
    gl_FragColor = vec4(col * intensity, shape * vAlpha);
    #include <colorspace_fragment>
  }
`

export const linkVertex = /* glsl */ `
  ${common}
  ${displace}
  attribute float aSeed;
  varying float vAlpha;
  varying float vScan;
  varying float vLens;

  void main() {
    vec3 p = displaced(position, aSeed);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;

    float reveal = smoothstep(aSeed - 0.04, aSeed + 0.02, uReveal);
    vec3 n = normalize((viewMatrix * vec4(normalize(world.xyz), 0.0)).xyz);
    float facing = n.z * 0.5 + 0.5;
    vScan = scanBand(world.y);
    vLens = pointerLens(gl_Position);
    vAlpha = mix(0.05, 1.0, facing * facing) * reveal * uFade;
  }
`

export const linkFragment = /* glsl */ `
  ${common}
  ${colors}
  varying float vAlpha;
  varying float vScan;
  varying float vLens;

  void main() {
    vec3 base = mix(uIon, uIris, uRekey * 0.8);
    base = mix(base, uVerified, uSuccess * 0.5);
    float a = (0.11 + uEnergy * 0.06 + vScan * 0.45 + vLens * 0.25) * vAlpha;
    gl_FragColor = vec4(base, a);
    #include <colorspace_fragment>
  }
`

export const packetVertex = /* glsl */ `
  ${common}
  ${displace}
  attribute vec3 aEnd;
  attribute float aSpeed;
  attribute float aOffset;
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    float travel = fract(uTime * aSpeed * (0.6 + uEnergy * 1.4) + aOffset);
    vec3 p = mix(position, aEnd, travel);
    p = displaced(p, aSeed);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    float reveal = smoothstep(aSeed - 0.04, aSeed + 0.02, uReveal);
    vec3 n = normalize((viewMatrix * vec4(normalize(world.xyz), 0.0)).xyz);
    float facing = smoothstep(-0.2, 0.6, n.z);
    float ends = smoothstep(0.0, 0.15, travel) * (1.0 - smoothstep(0.85, 1.0, travel));
    gl_PointSize = 5.0 * uPixelRatio * (8.5 / -mv.z) * reveal;
    vAlpha = facing * ends * reveal * uFade;
  }
`

export const packetFragment = /* glsl */ `
  ${common}
  ${colors}
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float shape = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uIon, uVerified, uSuccess);
    col = mix(col, uIris, uRekey * 0.5);
    gl_FragColor = vec4(col * 1.6, shape * shape * vAlpha);
    #include <colorspace_fragment>
  }
`

export const scanVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const scanFragment = /* glsl */ `
  ${common}
  ${colors}
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float edge = smoothstep(0.9, 0.985, d) * (1.0 - smoothstep(0.985, 1.0, d));
    float fill = pow(d, 3.0) * 0.07;
    float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
    float sweep = pow(0.5 + 0.5 * sin(angle - uTime * 1.6), 6.0);
    vec3 col = mix(uIon, uIris, uRekey * 0.8);
    col = mix(col, uDanger, uError);
    col = mix(col, uVerified, uSuccess);
    float a = (edge * (0.35 + sweep * 0.65) + fill) * (0.55 + uEnergy * 0.45) * uFade;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`

export const dustVertex = /* glsl */ `
  ${common}
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.15 + aSeed * 30.0) * 0.12;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aSeed * 2.2) * uPixelRatio * (9.0 / -mv.z);
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.4 + aSeed) + aSeed * 50.0);
    vAlpha = twinkle * (0.25 + aSeed * 0.45) * uFade;
  }
`

export const dustFragment = /* glsl */ `
  ${common}
  ${colors}
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float shape = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uAsset, uIris, 0.25 + uRekey * 0.5);
    gl_FragColor = vec4(col, shape * vAlpha * 0.8);
    #include <colorspace_fragment>
  }
`

export const coreVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

export const coreFragment = /* glsl */ `
  ${common}
  ${colors}
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
    vec3 col = mix(uIon, uIris, uRekey);
    col = mix(col, uDanger, uError * 0.8);
    col = mix(col, uVerified, uSuccess);
    float glow = fresnel * (0.9 + uEnergy * 0.8) + 0.08;
    gl_FragColor = vec4(col * glow * 1.4, clamp(glow, 0.0, 1.0) * uFade);
    #include <colorspace_fragment>
  }
`

export const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 scale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
    mv.xy += position.xy * scale.xy;
    gl_Position = projectionMatrix * mv;
  }
`

export const glowFragment = /* glsl */ `
  ${common}
  ${colors}
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float g = pow(max(1.0 - d, 0.0), 2.6);
    vec3 col = mix(uIon, uIris, uRekey);
    col = mix(col, uDanger, uError * 0.6);
    col = mix(col, uVerified, uSuccess);
    float a = g * (0.28 + uEnergy * 0.3 + uSuccess * 0.35) * uFade;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`
