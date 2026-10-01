/**
 * Chapter 02: a cut-away FinFET generated in code (transistor-math.js holds the dimensions).
 * Every part is a box; a fragment shader on patched MeshStandardMaterials does the rest:
 *  - targeted cuts (only flagged solids): the source half of the gate in front is removed so the
 *    front fin is seen entering a gate that wraps it on three sides, and the front halves of the
 *    front fin's source and drain are removed so the fin is exposed along its length. A back face
 *    seen through a cut is drawn as the section of its solid at the cut plane (depth written at
 *    the cut, nested solids resolved by priority), with thin interface lines like a polished
 *    cross-section;
 *  - rounded edges from the rounded-box distance field (normals only, silhouettes stay crisp), a
 *    slight edge wear, directional fine grain per material, analytic contact shadows;
 *  - the ON channel: a glowing layer at the fin surface under the gate.
 * Carriers are soft points along the front fin (umowna wizualizacja); where material hides them
 * they show as a faint ghost, so the path source -> channel -> drain stays readable.
 * The device sits on a wafer slab that falls off into the background; depth of field in one pass.
 */
import {
  AdditiveBlending, NormalBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, Mesh,
  DepthTexture, HalfFloatType, Matrix4, PointLight, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Points, Scene, ShaderMaterial,
  Vector2, Vector3, WebGLRenderTarget,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { components, transistorCamera, CUT_EPI, CUT_GATE, FRONT_FIN, GATE_CUT_K, DIM } from './transistor-math.js';
import { scaleBar } from './lattice-math.js';

const BG_SRGB = [11 / 255, 14 / 255, 18 / 255];
const AMBER = new Color('#e09a50');
/** Depth of field: blur radius as a share of the frame height per unit of |z - focus| / z. */
const APERTURE = .06;
// Base PBR values; grain: scale of the fine directional variation (stretched along the axis a
// real surface was polished or grown along).
const MATERIALS = {
  silicon: { color: '#8a939c', metalness: .65, roughness: .36, grain: [.03, .35, .35] },
  oxide: { color: '#34414e', metalness: 0, roughness: .1, grain: [.12, .12, .12] },
  dielectric: { color: '#dfe5ec', metalness: 0, roughness: .4, grain: [.25, .25, .25] },
  gate: { color: '#a59d92', metalness: .9, roughness: .3, grain: [.35, .03, .35] },
  nitride: { color: '#5d646b', metalness: 0, roughness: .62, grain: [.35, .03, .35] },
  epi: { color: '#9aa3ac', metalness: .55, roughness: .34, grain: [.03, .35, .35] },
  tungsten: { color: '#aeb4ba', metalness: .45, roughness: .5, grain: [.35, .35, .03] },
  liner: { color: '#55585e', metalness: .9, roughness: .38, grain: [.25, .25, .25] },
  tin: { color: '#b39869', metalness: .85, roughness: .38, grain: [.25, .25, .25] },
};

const COMMON_FRAGMENT = /* glsl */`
varying vec3 vWorld; varying vec3 vCenter; varying vec3 vHalf; varying float vRound; varying float vAngle; varying float vPrio; varying float vFin; varying float vCut;
uniform float uPower, uGateHalf;
uniform mat4 uViewProjection;
uniform vec3 uAmber, uGrain;
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
float hash3(vec3 p) { p = fract(p * .1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
`;

// Runs first in main(): the cuts, the section faces, the normal and the depth.
const CUT = /* glsl */`
  // Varyings are interpolated: compare with a tolerance, never with ==.
  bool gateCut = abs(vCut - ${CUT_GATE.toFixed(1)}) < .5, epiCut = abs(vCut - ${CUT_EPI.toFixed(1)}) < .5;
  if ((gateCut && vWorld.x + vWorld.y < ${GATE_CUT_K.toFixed(1)}) || (epiCut && vWorld.y < ${FRONT_FIN.toFixed(1)})) discard;
  bool cap = false;
  vec3 hit = vWorld, nWorld;
  float sd = 0.0;
  if (!gl_FrontFacing) {
    if (!gateCut && !epiCut) discard;
    // Where the view ray leaves the removed region (the camera is inside it): the section face
    // this pixel shows.
    vec3 ray = normalize(vWorld - cameraPosition);
    float rs = ray.x + ray.y;
    float t = gateCut ? (rs > 0.0 ? (${GATE_CUT_K.toFixed(1)} - cameraPosition.x - cameraPosition.y) / rs : 1e9)
                      : (ray.y > 0.0 ? (${FRONT_FIN.toFixed(1)} - cameraPosition.y) / ray.y : 1e9);
    hit = cameraPosition + ray * t;
    // Inside this solid at the cut? Rounded-box distance, so sections keep the rounded corners.
    vec3 local = rotX(hit - vCenter, -vAngle);
    vec3 qb = abs(local) - (vHalf - vRound);
    sd = length(max(qb, 0.0)) + min(max(qb.x, max(qb.y, qb.z)), 0.0) - vRound;
    if (t > 1e8 || sd > 1e-3) discard;
    cap = true;
    nWorld = gateCut ? vec3(-.70710678, -.70710678, 0.0) : vec3(0.0, -1.0, 0.0);
    vec4 clip = uViewProjection * vec4(hit, 1.0);
    gl_FragDepth = (clip.z / clip.w) * .5 + .5 - vPrio * 2e-6;
  } else {
    // Rounded-box normal: the box's flat faces bend over a radius vRound at the edges.
    vec3 local = rotX(vWorld - vCenter, -vAngle);
    vec3 q = max(abs(local) - (vHalf - vRound), 0.0);
    vec3 n = sign(local) * q;
    if (dot(n, n) < 1e-8) { vec3 a = abs(local) / vHalf; n = a.x > a.y && a.x > a.z ? vec3(sign(local.x), 0, 0) : a.y > a.z ? vec3(0, sign(local.y), 0) : vec3(0, 0, sign(local.z)); }
    nWorld = rotX(normalize(n), vAngle);
    // Edge wear: the second-nearest face distance is the distance to the nearest edge.
    vec3 d = vHalf - abs(local);
    float lo = min(d.x, min(d.y, d.z)), hi = max(d.x, max(d.y, d.z));
    sd = -(d.x + d.y + d.z - lo - hi);
    gl_FragDepth = gl_FragCoord.z;
  }
  // The ON channel: the surface layer of the fin under the gate (its front half is cut away to
  // show it), glowing; plus the fin's section, if any, near its surface.
  float channel = vFin > .5 ? uPower * (1.0 - smoothstep(uGateHalf - 1.0, uGateHalf + .5, abs(hit.x))) * step(0.0, hit.z) : 0.0;
  // Analytic contact shadows: near the isolation floor and in the gaps between fins and gates.
  float ao = 1.0;
  if (hit.z > 0.0) ao *= 1.0 - .45 * exp(-hit.z / 7.0) * (1.0 - abs(nWorld.z));
  if (nWorld.z > .5 && hit.z < 2.5) {
    float df = min(min(abs(hit.y + ${DIM.finPitch.toFixed(1)}), abs(hit.y)), abs(hit.y - ${DIM.finPitch.toFixed(1)})) - ${(DIM.finWidth / 2 + 2).toFixed(1)};
    float dg = min(min(abs(hit.x + ${DIM.gatePitch.toFixed(1)}), abs(hit.x)), abs(hit.x - ${DIM.gatePitch.toFixed(1)})) - uGateHalf - 8.0;
    ao *= (1.0 - .5 * exp(-max(df, 0.0) / 6.0)) * (1.0 - .45 * exp(-max(dg, 0.0) / 8.0));
  }
  float grain = vnoise(hit * uGrain) - .5;
  // Interfaces on a section face read as thin dark lines (only on parts thicker than a layer);
  // a slight lighter wear on outside edges.
  float line = cap ? (1.0 - smoothstep(.0, .7, -sd)) * step(2.5, min(vHalf.x, min(vHalf.y, vHalf.z))) : 0.0;
  float wear = cap ? 0.0 : 1.0 - smoothstep(0.0, 1.4, -sd);
  // Heavily doped source/drain in the silicon: a slightly darker tone (schematic profile).
  float doped = vFin > .5 ? smoothstep(10.0, 22.0, abs(hit.x)) * smoothstep(-6.0, 14.0, hit.z) : 0.0;
`;

function patch(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aCenter; attribute vec3 aHalf; attribute vec4 aShape; attribute float aCut;
varying vec3 vWorld; varying vec3 vCenter; varying vec3 vHalf; varying float vRound; varying float vAngle; varying float vPrio; varying float vFin; varying float vCut;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vCenter = aCenter; vHalf = aHalf;
vRound = aShape.x; vAngle = aShape.y; vPrio = aShape.z; vFin = aShape.w; vCut = aCut;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_FRAGMENT}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${CUT}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (cap) diffuseColor.rgb *= .8 * (1.0 - .22 * doped) * (1.0 - .5 * line); diffuseColor.rgb *= (1.0 + grain * .06) * (1.0 + .14 * wear);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (1.0 + grain * .25) + (cap ? .3 : 0.0), .04, 1.0);\nif (cap) metalnessFactor *= .25; // a section is read by its own colour, not by mirrored studio light')
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uAmber * channel * 2.0;')
      .replace('#include <fog_fragment>', '// The wafer slab runs back and falls off into the background (a horizon, not a vignette).\ngl_FragColor *= 1.0 - smoothstep(160.0, 330.0, length(vWorld.xy - vec2(0.0, -20.0)));')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= ao; reflectedLight.indirectSpecular *= mix(1.0, ao, .8); reflectedLight.directDiffuse *= ao;');
  };
  return material;
}

/** One merged geometry per material, with each box's frame as vertex attributes. */
function buildGeometries() {
  const groups = {};
  for (const c of components()) {
    const g = new BoxGeometry(c.half[0] * 2, c.half[1] * 2, c.half[2] * 2).toNonIndexed();
    g.rotateX(c.angle);
    g.translate(...c.center);
    const n = g.getAttribute('position').count;
    const fill = (size, values) => new BufferAttribute(Float32Array.from({ length: n * size }, (_, i) => values[i % size]), size);
    g.setAttribute('aCenter', fill(3, c.center));
    g.setAttribute('aHalf', fill(3, c.half));
    g.setAttribute('aShape', fill(4, [Math.min(c.round, ...c.half), c.angle, c.priority, c.fin ? 1 : 0]));
    g.setAttribute('aCut', fill(1, [c.cut]));
    g.deleteAttribute('uv');
    (groups[c.kind] ??= []).push(g);
  }
  return Object.fromEntries(Object.entries(groups).map(([kind, list]) => [kind, mergeGeometries(list)]));
}

/**
 * Carriers along the front fin's exposed face. OFF: piled up in the source against the gate.
 * ON: the whole path source -> channel -> drain. ghost: the copy drawn without depth test, faint,
 * so carriers inside the gate and under the drain contact stay visible.
 */
function buildCarriers(ghost, count = 46) {
  const g = new BufferGeometry();
  const rand = i => ((Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
  g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new BufferAttribute(Float32Array.from({ length: count * 2 }, (_, i) => rand(i)), 2));
  const points = new Points(g, new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uScale: { value: 1 } },
    defines: { GHOST: ghost ? 1 : 0, FIN_FACE: (FRONT_FIN - DIM.finWidth / 2 - .9).toFixed(1) },
    transparent: ghost, depthWrite: !ghost, depthTest: !ghost, blending: ghost ? AdditiveBlending : NormalBlending,
    vertexShader: /* glsl */`
      attribute vec2 aSeed; uniform float uTime, uPower, uScale; varying float vAlpha;
      void main() {
        float lane = aSeed.y;
        // OFF: piled up in the source just before the gate's spacer, densest at the barrier.
        float pile = 1.0 - pow(aSeed.x, 1.8);
        vec3 off = vec3(-52.0 + pile * 31.0, FIN_FACE, 6.0 + lane * 34.0);
        off += vec3(sin(uTime * 1.7 + aSeed.x * 40.0) * .8, 0.0, cos(uTime * 1.3 + lane * 30.0) * .8);
        // ON: from the source through the channel into the drain, and on.
        float s = fract(aSeed.x + uTime * .22);
        vec3 on = vec3(-52.0 + s * 104.0, FIN_FACE, 6.0 + lane * 34.0);
        vec3 p = mix(off, on, uPower);
        vAlpha = smoothstep(0.0, 5.0, p.x + 54.0) * (1.0 - smoothstep(-5.0, 0.0, p.x - 54.0)) * (GHOST == 1 ? .28 : 1.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 3.6 * uScale / -mv.z;
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.0;
        #if GHOST == 1
          float a = (1.0 - smoothstep(.2, 1.0, r)) * vAlpha;
          gl_FragColor = vec4(vec3(.78, .9, 1.0) * a, a);
        #else
          // A solid bead (it writes depth, so the depth of field treats it like an object).
          if (r > 1.0 || vAlpha < .02) discard;
          gl_FragColor = vec4(vec3(.62, .82, 1.0) * (2.2 - 1.2 * r * r) * vAlpha, 1.0);
        #endif
      }`,
  }));
  points.frustumCulled = false;
  points.renderOrder = ghost ? 30 : 29;
  return points;
}

export async function createTransistor({ renderer, environment, msaa = true, taps = 24 }) {
  let settings = { msaa, taps };
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1.4;
  // The studio HDR is Y-up, this scene is Z-up (z = height above the isolation): turn the studio
  // so its softboxes hang above the specimen.
  scene.environmentRotation.set(Math.PI / 2, 0, -.6);
  const uniforms = { uViewProjection: { value: new Matrix4() }, uPower: { value: 0 }, uGateHalf: { value: DIM.gateLength / 2 }, uAmber: { value: AMBER } };
  const geometries = buildGeometries();
  const materials = [];
  for (const [kind, geometry] of Object.entries(geometries)) {
    const { grain, ...pbr } = MATERIALS[kind];
    const material = patch(new MeshStandardMaterial({ ...pbr, side: DoubleSide }), { ...uniforms, uGrain: { value: new Vector3(...grain) } });
    material.customProgramCacheKey = () => 'finfet';
    materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  // A cool key from above the source side gives the faces their contrast; one low warm light
  // from the drain side is the sparse amber accent on edges.
  const key = new DirectionalLight('#e6eef8', .75);
  key.position.set(-160, -60, 300);
  const warm = new DirectionalLight('#ffb070', .45);
  warm.position.set(300, 120, 40);
  // ON: the channel's glow spills onto the gate stack around it (a small warm point light).
  const glow = new PointLight('#ffa860', 0, 34, 2);
  glow.position.set(-5, FRONT_FIN - 10, 30);
  scene.add(key, warm, glow);
  const carriers = [buildCarriers(false), buildCarriers(true)];
  scene.add(...carriers);

  // Depth of field: the scene is drawn into a linear HDR target with depth, then one full-screen
  // pass blurs by the thin-lens circle of confusion around the focal plane (the plane the scale
  // bar is true for), tone maps, and composites over the page background (also the fade).
  const makeTarget = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: settings.msaa ? 4 : 0, depthTexture: new DepthTexture(1, 1) });
  let target = makeTarget();
  const post = new Scene();
  const composite = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture }, tDepth: { value: target.depthTexture }, uTexel: { value: new Vector2() },
      uNear: { value: 1 }, uFar: { value: 1 }, uFocus: { value: 1 }, uCoc: { value: 0 }, uFade: { value: 1 }, uBg: { value: new Color().setRGB(...BG_SRGB) },
      uTaps: { value: settings.taps },
    },
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tColor, tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uFocus, uCoc, uFade, uTaps; uniform vec3 uBg; varying vec2 vUv;
      float depthAt(vec2 uv) { float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
      float cocAt(float z) { return min(uCoc * abs(z - uFocus) / z, 12.0); }
      void main() {
        float z0 = depthAt(vUv), c0 = cocAt(z0);
        vec4 sum = texture2D(tColor, vUv); float wsum = 1.0;
        // Tap count is a uniform (up to 24), so a profile change needs no recompile.
        for (int i = 0; i < 24; i++) {
          if (float(i) >= uTaps) break;
          float r = sqrt((float(i) + .5) / uTaps), a = float(i) * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * r * c0;
          vec2 uv = vUv + o * uTexel;
          float z = depthAt(uv);
          // A sharper sample in front of this pixel must not smear over it; samples behind may.
          float w = z >= z0 - 4.0 ? 1.0 : clamp(cocAt(z) - r * c0 + 1.0, 0.0, 1.0);
          sum += texture2D(tColor, uv) * w; wsum += w;
        }
        vec4 c = sum / wsum;
        gl_FragColor = vec4(c.rgb / max(c.a, 1e-4), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor = vec4(mix(uBg, gl_FragColor.rgb, clamp(c.a, 0.0, 1.0) * uFade), 1.0);
      }`,
  }));
  composite.frustumCulled = false;
  post.add(composite);
  const postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const camera = new PerspectiveCamera(30, 1, 5, 4000);
  camera.up.set(0, 0, 1);
  let framing = 'desktop', size = [1, 1];
  await renderer.compileAsync(scene, camera);

  return {
    /** next: { msaa, taps } of the current profile; follows a runtime demotion. */
    resize(width, height, nextFraming, next = settings) {
      size = [width, height]; framing = nextFraming;
      if (next.msaa !== settings.msaa) { target.dispose(); settings = next; target = makeTarget(); }
      settings = next;
      composite.material.uniforms.uTaps.value = settings.taps;
    },
    /**
     * state: { progress, time (ambient s), power (0..1), fade (0..1, 1 = fully visible) }.
     * Returns the scale bar for the focal plane (the camera target), or null when faded out.
     */
    render({ progress, time, power, fade = 1 }) {
      const cam = transistorCamera(progress, framing, time * 2 * Math.PI / 80);
      const focus = Math.hypot(...cam.position.map((v, i) => v - cam.target[i]));
      camera.fov = cam.fov; camera.aspect = size[0] / size[1];
      camera.near = focus * .4; camera.far = focus * 2;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      camera.updateMatrixWorld();
      uniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      uniforms.uPower.value = power;
      glow.intensity = 900 * power;
      const buffer = renderer.getDrawingBufferSize(new Vector2());
      if (target.width !== buffer.x || target.height !== buffer.y) target.setSize(buffer.x, buffer.y);
      composite.material.uniforms.tColor.value = target.texture;
      composite.material.uniforms.tDepth.value = target.depthTexture;
      for (const c of carriers) {
        const cu = c.material.uniforms;
        cu.uTime.value = time; cu.uPower.value = power; cu.uScale.value = buffer.y / 2 / Math.tan(cam.fov * Math.PI / 360);
      }
      const pu = composite.material.uniforms;
      pu.uTexel.value.set(1 / buffer.x, 1 / buffer.y);
      pu.uNear.value = camera.near; pu.uFar.value = camera.far; pu.uFocus.value = focus; pu.uFade.value = fade;
      // Blur radius in pixels per unit of |z - focus| / z (aperture as a share of the frame height).
      pu.uCoc.value = APERTURE * buffer.y;
      renderer.toneMappingExposure = .85;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(post, postCamera);
      return fade > .6 ? scaleBar(size[1], cam.fov, focus, 90) : null;
    },
    dispose() {
      for (const g of Object.values(geometries)) g.dispose();
      for (const m of materials) m.dispose();
      for (const c of carriers) { c.geometry.dispose(); c.material.dispose(); }
      target.dispose(); composite.geometry.dispose(); composite.material.dispose();
    },
  };
}
