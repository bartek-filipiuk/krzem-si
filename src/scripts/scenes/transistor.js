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
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, ExtrudeGeometry,
  Mesh, MeshStandardMaterial, PerspectiveCamera, Points, Scene, ShaderMaterial, Shape, Vector2, Vector3,
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
  gate: { tint: '#5d5a56', alpha: .05, edge: .55, glow: .2 },
  tin: { tint: '#a4834f', alpha: .06, edge: .6, glow: .6 },
  dielectric: { tint: '#c9d3dc', alpha: .05, edge: .7, glow: 1 },
  nitride: { tint: '#4a5157', alpha: .04, edge: .35, glow: 0 },
  tungsten: { tint: '#8d949b', alpha: .06, edge: .65, glow: 0 },
  liner: { tint: '#555a61', alpha: .03, edge: .4, glow: 0 },
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
  const m = new MeshStandardMaterial({ color: tint, metalness: .3, roughness: .25, transparent: true, depthWrite: false, side: DoubleSide, envMapIntensity: .45 });
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
// The gate's state: a soft glow in the metal and its dielectric wrap; the pulse runs down the contact.
float pulse = vContact > .5 && uPulse >= 0.0 ? exp(-pow((vWorld.z - mix(105.0, 85.0, uPulse)) / 2.5, 2.0)) : 0.0;
totalEmissiveRadiance += uAmber * (uGlowK * uGate * (.35 + edgeLine) * .6 + pulse * 3.0);`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
gl_FragColor.a = clamp(uAlpha + .2 * fres + uEdge * edgeLine + uGlowK * uGate * .12 + pulse, 0.0, 1.0);`);
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
 * Carriers: particles on the fin surfaces (both side walls and the top) of the three fins. ON they
 * stream from source to drain through the channel; OFF they dam up at the gate edge, a few
 * hovering. Trails: the same particles drawn at earlier times with less alpha.
 */
function buildCarriers(lag, count) {
  const g = new BufferGeometry();
  const rand = i => ((Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
  g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new BufferAttribute(Float32Array.from({ length: count * 4 }, (_, i) => rand(i + 7)), 4));
  const points = new Points(g, new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStream: { value: 0 }, uScale: { value: 1 }, uLag: { value: lag }, uFade: { value: 1 } },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uStream, uScale, uLag; varying float vAlpha;
      float halfWidth(float z) { return 5.0 - 2.0 * clamp(z / ${H.toFixed(1)}, 0.0, 1.0); }
      void main() {
        float fin = floor(aSeed.x * 2.999) - 1.0;
        float q = aSeed.y; // around the fin: left wall, top, right wall
        float t = uTime - uLag;
        float speed = .2 + .08 * aSeed.w;
        float xon = -60.0 + fract(aSeed.z + t * speed) * 120.0;
        // OFF: piled up before the gate (spacer edge), denser near it, jittering; a few hover.
        float pile = pow(aSeed.z, .6);
        float xoff = -${(L + 8.5).toFixed(1)} - pile * pile * 22.0 + sin(t * 2.3 + aSeed.w * 40.0) * .6;
        float x = mix(xoff, xon, uStream);
        float z, y, off = .7;
        if (q < .4) { z = 2.0 + q / .4 * ${(H - 5).toFixed(1)}; y = -halfWidth(z) - off; }
        else if (q < .6) { float a = (q - .4) / .2; z = ${(H + .7).toFixed(1)} - 1.6 * pow(2.0 * a - 1.0, 2.0); y = mix(-halfWidth(${H.toFixed(1)}), halfWidth(${H.toFixed(1)}), a); }
        else { z = 2.0 + (1.0 - q) / .4 * ${(H - 5).toFixed(1)}; y = halfWidth(z) + off; }
        vec3 p = vec3(x, fin * ${DIM.finPitch.toFixed(1)} + y, z);
        vAlpha = smoothstep(-60.0, -54.0, x) * (1.0 - smoothstep(54.0, 60.0, x)) * exp(-uLag * 9.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.5, 1.1 * uScale / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha; uniform float uFade;
      void main() { float r = length(gl_PointCoord - .5) * 2.0; float a = (1.0 - smoothstep(.1, 1.0, r)) * vAlpha * uFade;
        gl_FragColor = vec4(vec3(.75, .9, 1.0) * a * 1.6, a); }`,
  }));
  points.frustumCulled = false;
  points.renderOrder = 30;
  return points;
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
  ['dielectric', 'tin', 'gate', 'nitride', 'liner', 'tungsten'].forEach((kind, i) =>
    add(mergedBoxes(parts.filter(c => c.kind === kind)), ghostMaterial(GHOSTS[kind], uniforms), 10 + i));

  const key = new DirectionalLight('#e6eef8', .9);
  key.position.set(-160, -60, 300);
  const warm = new DirectionalLight('#ffb070', .5);
  warm.position.set(300, 120, 40);
  scene.add(key, warm);
  let carriers = [];
  const setTrails = n => {
    for (const c of carriers) { scene.remove(c); c.geometry.dispose(); c.material.dispose(); }
    carriers = Array.from({ length: 1 + n }, (_, k) => buildCarriers(k * .07, 700));
    scene.add(...carriers);
  };
  setTrails(trails);

  const camera = new PerspectiveCamera(30, 1, 5, 4000);
  camera.up.set(0, 0, 1);
  let framing = 'desktop', size = [1, 1];
  await dof.compile(scene, camera);

  return {
    resize(width, height, nextFraming) { size = [width, height]; framing = nextFraming; },
    /** Fewer trail copies on a weaker profile (fill rate). */
    setTrails(n) { if (n !== carriers.length - 1) setTrails(n); },
    /**
     * state: { progress, time (ambient s), power: { on, s } (target state and the progress of its
     * switching sequence), fade (opacity over what the canvas holds) }.
     */
    render({ progress, time, power, fade = 1 }) {
      const cam = transistorCamera(progress, framing, time * 2 * Math.PI / 80);
      const focus = Math.hypot(...cam.position.map((v, i) => v - cam.target[i]));
      camera.fov = cam.fov; camera.aspect = size[0] / size[1];
      camera.near = focus * .3; camera.far = focus * 3;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      const st = switchState(power.on, power.s);
      uniforms.uGate.value = st.gate; uniforms.uPulse.value = st.pulse;
      uniforms.uChannel.value.set(...st.channel); uniforms.uStream.value = st.stream;
      const height = renderer.getDrawingBufferSize(new Vector2()).y;
      for (const c of carriers) {
        const cu = c.material.uniforms;
        cu.uTime.value = time; cu.uStream.value = st.stream; cu.uScale.value = height / 2 / Math.tan(cam.fov * Math.PI / 360);
      }
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
