/**
 * Chapter 02: a FinFET generated in code (transistor-math.js holds the dimensions and the switch
 * sequence). The channel is the hero, not the packaging:
 *  - fins: solid crystalline silicon, tapered with rounded tops (extruded profile), a faint lattice
 *    on their surface up close; the channel lights up on their top and both side walls under the
 *    gate, igniting from the source side;
 *  - source/drain: faceted (diamond-profile) epitaxy, translucent crystal so the flow inside shows;
 *  - gate stack, spacers, cap, contacts: smoked glass (ghosts) with crisp lit edges and visible
 *    thickness, so the gate wrapping the fins is seen through them; the gate contact carries the
 *    switching pulse, the gate metal and its dielectric glow while the gate is on;
 *  - carriers: many small bright particles with short trails following the fin surfaces
 *    (umowna wizualizacja), stopping at the gate edge when off.
 * Lit by the studio HDR, a cool key and a low warm light; depth of field from rendering/dof.js.
 */
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, Color, DirectionalLight, DoubleSide, ExtrudeGeometry, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Shape, Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { components, finHalfWidth, switchState, transistorCamera, DIM, FIN_LENGTH } from './transistor-math.js';
import { scaleBar, A } from './lattice-math.js';

const AMBER = new Color('#e09a50');
/** Depth of field: blur radius as a share of the frame height per unit of |z - focus| / z. */
const APERTURE = .05;
const SOLIDS = {
  silicon: { color: '#8a939c', metalness: .65, roughness: .36 },
  oxide: { color: '#1b232c', metalness: 0, roughness: .18 },
};
// Ghost tint, base opacity, edge strength, glow when the gate is on.
const GHOSTS = {
  gate: { tint: '#2e2d2c', alpha: .05, edge: .5, glow: .45 },
  tin: { tint: '#8a6c3f', alpha: .04, edge: .55, glow: 1.1 },
  dielectric: { tint: '#9aa6b0', alpha: .03, edge: .55, glow: 1.4 },
  nitride: { tint: '#262b30', alpha: .04, edge: .3, glow: 0 },
  tungsten: { tint: '#5f666d', alpha: .05, edge: .55, glow: 0 },
};
const L = DIM.gateLength / 2, H = DIM.finHeight;

// ---- shared shader pieces ----------------------------------------------------------------------
const BOX_VERTEX_HEAD = 'attribute vec3 aCenter; attribute vec3 aHalf; attribute vec4 aShape;\nvarying vec3 vWorld; varying vec3 vCenter; varying vec3 vHalf; varying float vRound;';
const BOX_VERTEX = 'vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vCenter = aCenter; vHalf = aHalf; vRound = aShape.x;';
const BOX_FRAGMENT = /* glsl */`
varying vec3 vWorld; varying vec3 vCenter; varying vec3 vHalf; varying float vRound;
// Rounded-box normal and the distance to the nearest edge (for lit edges and wear).
vec3 boxNormal(out float edge) {
  vec3 local = vWorld - vCenter;
  vec3 q = max(abs(local) - (vHalf - vRound), 0.0);
  vec3 n = sign(local) * q;
  if (dot(n, n) < 1e-8) { vec3 a = abs(local) / vHalf; n = a.x > a.y && a.x > a.z ? vec3(sign(local.x), 0, 0) : a.y > a.z ? vec3(0, sign(local.y), 0) : vec3(0, 0, sign(local.z)); }
  vec3 d = vHalf - abs(local);
  edge = d.x + d.y + d.z - min(d.x, min(d.y, d.z)) - max(d.x, max(d.y, d.z));
  return normalize(n);
}
`;

/** Solid boxes (substrate, oxide, fin roots): rounded normals, contact shadow near the oxide. */
function solidMaterial(params) {
  const m = new MeshStandardMaterial({ ...params });
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${BOX_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BOX_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${BOX_FRAGMENT}`)
      .replace('#include <normal_fragment_begin>', `float edgeD; vec3 nW = boxNormal(edgeD);
float faceDirection = 1.0; vec3 normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz); vec3 nonPerturbedNormal = normal;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
// Contact shadows on the oxide next to the fins.
float df = min(min(abs(vWorld.y + ${DIM.finPitch.toFixed(1)}), abs(vWorld.y)), abs(vWorld.y - ${DIM.finPitch.toFixed(1)})) - 5.0;
float ao = vWorld.z > -.5 && nW.z > .5 ? 1.0 - .5 * exp(-max(df, 0.0) / 5.0) : 1.0;
reflectedLight.indirectDiffuse *= ao; reflectedLight.directDiffuse *= ao;`);
  };
  m.customProgramCacheKey = () => 'finfet-solid';
  return m;
}

/**
 * Smoked glass: a faint body, fresnel at grazing angles and bright lit edges (both the front and
 * the back faces are drawn, so the thickness of each part shows). Glow: the gate's state.
 */
function ghostMaterial({ tint, alpha, edge, glow }, uniforms) {
  const m = new MeshStandardMaterial({ color: tint, metalness: .3, roughness: .25, transparent: true, depthWrite: false, side: DoubleSide, envMapIntensity: .25 });
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uAlpha: { value: alpha }, uEdge: { value: edge }, uGlowK: { value: glow } });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${BOX_VERTEX_HEAD}\nattribute float aContact; varying float vContact;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BOX_VERTEX}\nvContact = aContact;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${BOX_FRAGMENT}
uniform float uAlpha, uEdge, uGlowK, uGate, uPulse; uniform vec3 uAmber; varying float vContact;`)
      .replace('#include <normal_fragment_begin>', `float edgeD; vec3 nW = boxNormal(edgeD);
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz) * faceDirection; vec3 nonPerturbedNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float lineW = fwidth(edgeD) * 1.2 + .25;
float edgeLine = 1.0 - smoothstep(0.0, lineW, edgeD);
// The gate's state: a glow in the metal and its dielectric wrap; the pulse runs down the gate
// contact and on down through the gate to the fins.
float pulseZ = mix(105.0, 0.0, uPulse);
float pulse = uPulse >= 0.0 && (vContact > .5 || uGlowK > 0.0) ? exp(-pow((vWorld.z - pulseZ) / 3.5, 2.0)) : 0.0;
totalEmissiveRadiance += uAmber * (uGlowK * uGate * (.5 + 1.5 * edgeLine) + pulse * 4.0);`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
gl_FragColor.a = clamp(uAlpha + .12 * fres + uEdge * edgeLine + uGlowK * uGate * .1 + pulse * .8, 0.0, 1.0);`);
  };
  m.customProgramCacheKey = () => 'finfet-ghost';
  return m;
}

/** Boxes of one kind merged, with each box's frame as vertex attributes. */
function mergedBoxes(list) {
  return mergeGeometries(list.map(c => {
    const g = new BoxGeometry(c.half[0] * 2, c.half[1] * 2, c.half[2] * 2, 1, 1, 1).toNonIndexed();
    g.translate(...c.center);
    const n = g.getAttribute('position').count;
    const fill = (size, values) => new BufferAttribute(Float32Array.from({ length: n * size }, (_, i) => values[i % size]), size);
    g.setAttribute('aCenter', fill(3, c.center));
    g.setAttribute('aHalf', fill(3, c.half));
    g.setAttribute('aShape', fill(4, [Math.min(c.round, ...c.half), 0, 0, 0]));
    g.setAttribute('aContact', fill(1, [c.gateContact ? 1 : 0]));
    g.deleteAttribute('uv');
    return g;
  }));
}

/** Extrude a (y, z) profile along x from x0 to x1. */
function extrudeX(points, x0, x1, y0) {
  const shape = new Shape(points.map(([y, z]) => new Vector2(y, z)));
  const g = new ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 6 });
  // Shape (u, v) = (y, z), extruded along +w: map w -> x.
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getY(i), w = pos.getZ(i);
    pos.setXYZ(i, x0 + w, y0 + u, v);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const flat = g.index ? g.toNonIndexed() : g;
  flat.computeVertexNormals();
  return flat;
}

/** Tapered fin profile with a rounded top (finHalfWidth), around y = 0. */
function finProfile() {
  const pts = [];
  const top = H - 3;
  for (let i = 0; i <= 6; i++) { const z = top * i / 6; pts.push([-finHalfWidth(z), z]); }
  for (let i = 1; i < 12; i++) { const a = Math.PI - Math.PI * i / 12; const r = finHalfWidth(H); pts.push([Math.cos(a) * r, top + Math.sin(a) * 3]); }
  for (let i = 6; i >= 0; i--) { const z = top * i / 6; pts.push([finHalfWidth(z), z]); }
  return pts;
}

/** Diamond-profile epitaxy around a fin (110 facets), flat bottom on the fin's shoulders. */
function epiProfile() {
  return [[-6, 24], [-12, 33], [-12, 39], [-6, 47], [0, 50], [6, 47], [12, 39], [12, 33], [6, 24]];
}

/** Fin material: crystalline silicon, the channel on its surface under the gate, a faint lattice. */
function finMaterial(uniforms) {
  const m = new MeshStandardMaterial({ color: '#68727c', metalness: .5, roughness: .3, envMapIntensity: .5 });
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldF;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldF = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWorldF; uniform vec2 uChannel; uniform vec3 uAmber; uniform float uStream;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
// Lattice planes of silicon (a = ${A.toFixed(4)} nm) as a faint relief, only where they resolve.
float la = ${A.toFixed(4)};
vec2 lp = vec2(vWorldF.x, vWorldF.z) / la;
float lat = (.5 + .5 * cos(6.2831 * lp.x)) * (.5 + .5 * cos(6.2831 * lp.y));
float resolve = 1.0 - smoothstep(.12, .3, fwidth(lp.x));
diffuseColor.rgb *= 1.0 - .28 * lat * resolve;
// Doped source/drain regions read slightly darker than the channel.
diffuseColor.rgb *= 1.0 - .18 * smoothstep(${(L + 2).toFixed(1)}, ${(L + 10).toFixed(1)}, abs(vWorldF.x));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// The channel: a sheet at the fin surface under the gate between uChannel.x and uChannel.y.
float cx = vWorldF.x / ${DIM.gateLength.toFixed(1)};
float sheet = smoothstep(uChannel.x - .02, uChannel.x + .02, cx) * (1.0 - smoothstep(uChannel.y - .06, uChannel.y + .02, cx));
sheet *= step(.5, vWorldF.z) * step(uChannel.x + .001, uChannel.y);
// The channel front glows brighter while it travels.
float front = exp(-pow((cx - uChannel.y) / .08, 2.0)) * step(uChannel.y, .49) * step(uChannel.x + .001, uChannel.y);
// Carriers entering/leaving: a faint warm wash along the fin outside the gate while it conducts.
float wash = uStream * .12 * (1.0 - smoothstep(${L.toFixed(1)}, 55.0, abs(vWorldF.x))) * step(${L.toFixed(1)}, abs(vWorldF.x));
totalEmissiveRadiance += uAmber * (sheet * 1.6 + front * 1.4 + wash);`);
  };
  m.customProgramCacheKey = () => 'finfet-fin';
  return m;
}

/**
 * Carriers: short streaks lying on the fin surfaces (both side walls and the top) of the three fins,
 * one instanced quad each, bright at the head and fading along the tail. ON they stream from source
 * to drain through the channel; OFF they stand in a sharp front at the gate edge, piled behind it.
 */
function buildCarriers(count) {
  const quad = new PlaneGeometry(1, 1);
  const g = new InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.getAttribute('position'));
  const rand = i => ((Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
  g.setAttribute('aSeed', new InstancedBufferAttribute(Float32Array.from({ length: count * 4 }, (_, i) => rand(i + 7)), 4));
  g.instanceCount = count;
  const mesh = new Mesh(g, new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStream: { value: 0 }, uLength: { value: 7 } },
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uStream, uLength; varying vec2 vUv; varying float vAlpha, vGlow;
      float halfWidth(float z) { return 5.0 - 2.0 * clamp(z / ${H.toFixed(1)}, 0.0, 1.0); }
      void main() {
        float fin = floor(aSeed.x * 2.999) - 1.0;
        float q = aSeed.y; // around the fin: left wall, top, right wall
        float speed = .16 + .06 * aSeed.w;
        float xon = -62.0 + fract(aSeed.z + uTime * speed) * 124.0;
        // OFF: a sharp front at the gate edge, the rest piled behind it.
        float dam = -${(L + 8.6).toFixed(1)};
        float xoff = dam - pow(aSeed.z, 2.2) * 34.0 + sin(uTime * 2.1 + aSeed.w * 40.0) * .25;
        float x = mix(xoff, xon, uStream);
        float len = mix(2.2, uLength, uStream);
        vGlow = mix(1.8, 1.0, uStream);
        vec3 p, across;
        float off = .45;
        if (q < .42) { float z = 2.0 + q / .42 * ${(H - 5).toFixed(1)}; p = vec3(x, -halfWidth(z) - off, z); across = vec3(0.0, 0.0, 1.0); }
        else if (q < .58) { float a = (q - .42) / .16; p = vec3(x, mix(-2.4, 2.4, a), ${(H + .35).toFixed(1)}); across = vec3(0.0, 1.0, 0.0); }
        else { float z = 2.0 + (1.0 - q) / .42 * ${(H - 5).toFixed(1)}; p = vec3(x, halfWidth(z) + off, z); across = vec3(0.0, 0.0, 1.0); }
        p.y += fin * ${DIM.finPitch.toFixed(1)};
        vUv = position.xy + .5;
        // The quad: the head at x, the tail behind it along the fin, .45 nm wide on the surface.
        vec3 world = p + vec3(-(1.0 - vUv.x) * len, 0.0, 0.0) + across * position.y * .45;
        vAlpha = smoothstep(-62.0, -55.0, x) * (1.0 - smoothstep(54.0, 62.0, x));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vAlpha, vGlow;
      void main() {
        // clamp: interpolation can leave vUv a hair below 0, and pow() of a negative is NaN (black).
        vec2 uv = clamp(vUv, 0.0, 1.0);
        float a = pow(uv.x, 2.2) * (1.0 - pow(abs(uv.y - .5) * 2.0, 2.0)) * vAlpha;
        gl_FragColor = vec4(vec3(.78, .9, 1.0) * a * 2.2 * vGlow, a);
      }`,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 30;
  quad.dispose();
  return mesh;
}

export async function createTransistor({ renderer, environment, dof, trails = 4 }) {
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1.4;
  // The studio HDR is Y-up, this scene is Z-up: turn the studio so its softboxes hang above.
  scene.environmentRotation.set(Math.PI / 2, 0, -.6);
  const uniforms = { uGate: { value: 0 }, uPulse: { value: -1 }, uChannel: { value: new Vector2(-.5, -.5) }, uStream: { value: 0 }, uAmber: { value: AMBER } };
  const parts = components();
  const disposables = [];
  const add = (geometry, material, order = 0) => {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false; mesh.renderOrder = order;
    scene.add(mesh); disposables.push(geometry, material);
  };
  for (const kind of Object.keys(SOLIDS)) add(mergedBoxes(parts.filter(c => c.kind === kind && !c.shape)), solidMaterial(SOLIDS[kind]));
  // Fins and epitaxy (their own geometry).
  const fins = parts.filter(c => c.shape === 'fin'), epis = parts.filter(c => c.shape === 'epi');
  add(mergeGeometries(fins.map(f => extrudeX(finProfile(), -FIN_LENGTH / 2, FIN_LENGTH / 2, f.center[1]))), finMaterial(uniforms));
  const epiMat = new MeshStandardMaterial({ color: '#8d98a3', metalness: .5, roughness: .22, transparent: true, opacity: .5, depthWrite: false, flatShading: true, envMapIntensity: .7 });
  add(mergeGeometries(epis.map(e => extrudeX(epiProfile(), e.center[0] - e.half[0], e.center[0] + e.half[0], e.center[1]))), epiMat, 5);
  // Ghosts, inner first so the outer glass composites over them.
  ['dielectric', 'tin', 'gate', 'nitride', 'tungsten'].forEach((kind, i) =>
    add(mergedBoxes(parts.filter(c => c.kind === kind)), ghostMaterial(GHOSTS[kind], uniforms), 10 + i));

  const key = new DirectionalLight('#e6eef8', .9);
  key.position.set(-160, -60, 300);
  const warm = new DirectionalLight('#ffb070', .5);
  warm.position.set(300, 120, 40);
  scene.add(key, warm);
  let carriers = [];
  const setTrails = n => {
    for (const c of carriers) { scene.remove(c); c.geometry.dispose(); c.material.dispose(); }
    carriers = [buildCarriers(n >= 4 ? 1400 : 800)];
    scene.add(...carriers);
  };
  setTrails(trails);

  const camera = new PerspectiveCamera(30, 1, 5, 4000);
  camera.up.set(0, 0, 1);
  let framing = 'desktop', size = [1, 1];
  await dof.compile(scene, camera);

  return {
    resize(width, height, nextFraming) { size = [width, height]; framing = nextFraming; },
    /** Fewer carriers on a weaker profile (fill rate). */
    setTrails(n) { if ((n >= 4 ? 1400 : 800) !== carriers[0].geometry.instanceCount) setTrails(n); },
    /**
     * state: { progress, time (ambient s), power: { on, s } (target state and the progress of its
     * switching sequence), fade (opacity over what the canvas holds) }.
     */
    render({ progress, time, power, fade = 1 }) {
      const cam = transistorCamera(progress, framing, time * 2 * Math.PI / 80);
      const focus = Math.hypot(...cam.position.map((v, i) => v - cam.target[i]));
      camera.fov = cam.fov; camera.aspect = size[0] / size[1];
      // The near plane must stay clear of the wafer slab: at .3 x focus it sliced through the slab's
      // front in the close view and the cut edge jumped with every sway of the camera.
      camera.near = focus * .04; camera.far = focus * 6;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      const st = switchState(power.on, power.s);
      uniforms.uGate.value = st.gate; uniforms.uPulse.value = st.pulse;
      uniforms.uChannel.value.set(...st.channel); uniforms.uStream.value = st.stream;
      for (const c of carriers) { const cu = c.material.uniforms; cu.uTime.value = time; cu.uStream.value = st.stream; }
      renderer.toneMappingExposure = .9;
      dof.render(scene, camera, { focus, aperture: APERTURE, opacity: fade });
      return fade > .6 ? { ...scaleBar(size[1], cam.fov, focus, 90), scene: 'transistor' } : null;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      for (const c of carriers) { c.geometry.dispose(); c.material.dispose(); }
    },
  };
}
