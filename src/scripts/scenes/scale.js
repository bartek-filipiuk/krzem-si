/**
 * Chapter 03: from one transistor to the chip. Scroll drives one continuous camera move
 * (scale-math.js: entry, repetition, inside the layers, reveal, exit) through the interconnect
 * stack, which is deposited level by level as the camera rises (the order of fabrication).
 *
 * Three nested representations, each handing over to the next with a complementary dither (the
 * same screen-space hash keeps a pixel in exactly one of them, and depth of field smooths it):
 *  - near: instanced boxes (transistor rows, every metal level and its vias), real geometry;
 *  - mid: flat textured floors that continue each level beyond its generated square, filtered
 *    analytically (box-filtered stripes), so lines below a pixel average out instead of shimmering;
 *  - far: the die surface with a seeded floorplan and the top metal as a filtered texture.
 * Light: the studio HDR, one low warm sun (shadow map on cinematic), darkening with depth in the
 * stack, distance fog to the page background, depth of field from rendering/dof.js.
 */
import {
  BoxGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide, Fog, InstancedBufferAttribute, InstancedMesh, LinearMipmapLinearFilter, Matrix4, MeshDepthMaterial,
  MeshStandardMaterial, Mesh, PerspectiveCamera, PlaneGeometry, RGBADepthPacking, Scene, Vector3, Vector4,
} from 'three';
import { AFTER, DIE, FEOL_EXTENT, LEVELS, STACK_TOP, buildHeight, floorplan, growth, route, scaleCamera, transistorRows } from './scale-math.js';
import { scaleBar } from './lattice-math.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from '../story/timeline.js';

const BG = new Color('#0b0e12');
// Lower levels cool steel/graphite (cobalt, tungsten-like), copper only from the middle up.
const METALS = {
  lower: { color: '#7c858f', metalness: .85, roughness: .4 },
  copper: { color: '#a07f6a', metalness: .65, roughness: .38, cap: .45 },
  thick: { color: '#b89274', metalness: .45, roughness: .45, cap: .5 },
  silicon: { color: '#8a939c', metalness: .6, roughness: .38 },
  gate: { color: '#a59d92', metalness: .85, roughness: .32 },
  epi: { color: '#9aa3ac', metalness: .5, roughness: .36 },
  tungsten: { color: '#7d848b', metalness: .6, roughness: .5 },
};
// Low sun from the left of the reveal avenue (+y), a little ahead of the camera.
const SUN = new Vector3(.32, .7, .95).normalize();
// For the reveal the sun drops lower and comes from the right of the view (long shadows, the left
// under the heading in shade); between the two the direction is interpolated.
const SUN_LOW = new Vector3(.35, -.78, .55).normalize();
const sunDir = new Vector3();
/** Shared by every material of the scene (same objects, so one update reaches all). */
const LIGHT = { uSunDir: { value: sunDir }, uHorizon: { value: new Color('#8f735c') }, uHorizonMix: { value: 0 }, uHaze: { value: new Color('#3d3029') }, uDeep: { value: new Color('#05080d') },
  uCool: { value: new Vector3(.78, .9, 1.12) }, uU: { value: 0 } };

const FOG = /* glsl */`
#ifdef USE_FOG
  // Distance fog, lit warm toward the low sun (light scattered in the haze down an avenue).
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  float glow = pow(max(dot(normalize(vWorldP - cameraPosition), uSunDir), 0.0), 5.0);
  // Depths go blue-black (the canyon floors), the distance goes to the page background.
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep, .65 * (1.0 - exp(-max(uTop - vWorldP.z, 0.0) / uShadeScale)));
  // Toward the horizon of the reveal the haze is a little lighter and warmer (low sun in the air).
  vec3 hazeColor = mix(mix(fogColor, uHaze, glow), uHorizon * (.6 + .6 * glow), uHorizonMix);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, fogFactor);
#endif
`;
const COMMON = /* glsl */`
uniform float uVis, uGrow, uTop, uLiner, uCap, uShadeScale, uU;
uniform vec3 uSunDir, uHaze, uDeep, uCool, uHorizon;
uniform float uHorizonMix;
varying vec3 vLocal; varying vec3 vHalf; varying vec3 vWorldP;
float hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float hash3(vec3 p) { p = fract(p * .1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
// Darker the deeper below the current top of the stack (canyons), never black.
float depthShade(float z) { return mix(.2, 1.0, exp(-max(uTop - z, 0.0) / uShadeScale)); }
`;

/** Instanced boxes: growth from the base, rounded edges, liner edges, wear, depth shading, dither. */
function boxMaterial(params, uniforms, dither) {
  const material = new MeshStandardMaterial({ ...params });
  // A shader with discard loses early depth testing; only the variant used during a hand-over has it.
  if (dither) material.defines = { DITHER: 1 };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nattribute float aAfter;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
// Metal on the camera's street is deposited only after the camera has passed (aAfter > 0).
float grow = uGrow * (aAfter > 0.0 ? smoothstep(aAfter, aAfter + ${AFTER.span.toFixed(3)}, uU) : 1.0);
if (grow < 1e-3) transformed = vec3(0.0); // nothing yet: a degenerate box, never rasterised
transformed.z = (transformed.z + .5) * grow - .5;
vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vHalf = size * vec3(.5, .5, .5 * grow);
vLocal = vec3(transformed.xy, transformed.z - (grow - 1.0) * .5) * size;
vWorldP = (instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
#ifdef DITHER
if (hash2(gl_FragCoord.xy) >= uVis) discard;
#endif
float r = min(min(vHalf.x, vHalf.y), vHalf.z) * .2;
vec3 q = max(abs(vLocal) - (vHalf - r), 0.0);
vec3 nb = sign(vLocal) * q;
if (dot(nb, nb) < 1e-10) { vec3 a = abs(vLocal) / vHalf; nb = a.x > a.y && a.x > a.z ? vec3(sign(vLocal.x), 0, 0) : a.y > a.z ? vec3(0, sign(vLocal.y), 0) : vec3(0, 0, sign(vLocal.z)); }
vec3 nWorld = normalize(nb);
vec3 dd = vHalf - abs(vLocal);
float edge = dd.x + dd.y + dd.z - min(dd.x, min(dd.y, dd.z)) - max(dd.x, max(dd.y, dd.z));
float lineW = min(vHalf.x, vHalf.y);
// Barrier liner: a thin dark band where the line's sides meet its polished top.
float liner = uLiner * (nWorld.z > .5 ? 1.0 - smoothstep(lineW * .05, lineW * .09, min(dd.x, dd.y)) : 0.0);
// A thin cap on the polished top of copper lines: a cooler, smoother sheen than the sides.
float cap = nWorld.z > .5 ? uCap : 0.0;
float wear = 1.0 - smoothstep(0.0, r * 1.2, edge);
float grain = vnoise(vWorldP / (lineW * vec3(1.6, 1.6, .9) + 1e-3)) - .5;
// Finer structure that holds up close: plating grain on top faces, vertical etch striations on
// the sides (scaled to the line, so every level gets the same look at its own size).
vec3 fp = vWorldP / (lineW * .07 + 1e-3);
float fineGrain = vnoise(fp) - .5;
float striation = abs(nWorld.z) < .5 ? vnoise(vec3(fp.x * .15 + fp.y * .15, fp.x * .6 + fp.y * .6, fp.z * .04) * vec3(1.0, 3.0, 1.0)) - .5 : 0.0;
grain = grain * .6 + fineGrain * .5 + striation * .9;
float ao = depthShade(vWorldP.z) * (abs(nWorld.z) < .5 ? mix(.55, 1.0, smoothstep(0.0, vHalf.z * 1.4, vLocal.z + vHalf.z)) : 1.0);`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .64, .67), cap) * (1.0 + grain * .07) * (1.0 + .18 * wear) * (1.0 - .7 * liner);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (1.0 + grain * .3) + liner * .3 - cap * .14, .05, 1.0);')
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= ao * uCool; reflectedLight.indirectSpecular *= ao * uCool; reflectedLight.directDiffuse *= mix(1.0, ao, .6); reflectedLight.directSpecular *= mix(1.0, ao, .6);')
      .replace('#include <fog_fragment>', FOG);
  };
  material.customProgramCacheKey = () => `scale-box-${dither ? 1 : 0}`;
  return material;
}

/** Shadow depth that grows like the boxes. */
function boxDepthMaterial(uniforms) {
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGrow, uU;\nattribute float aAfter;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float grow = uGrow * (aAfter > 0.0 ? smoothstep(aAfter, aAfter + ${AFTER.span.toFixed(3)}, uU) : 1.0);
if (grow < 1e-3) transformed = vec3(0.0);
transformed.z = (transformed.z + .5) * grow - .5;`);
  };
  material.customProgramCacheKey = () => 'scale-box-depth';
  return material;
}

function boxes(list, { cap = 0, ...params }, { liner = 0, shadows } = {}) {
  const uniforms = { uVis: { value: 1 }, uGrow: { value: 1 }, uTop: { value: 1000 }, uShadeScale: { value: 300 }, uLiner: { value: liner }, uCap: { value: cap }, ...LIGHT };
  const variants = [boxMaterial(params, uniforms, false), boxMaterial(params, uniforms, true)];
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), variants[0], Math.max(1, list.length));
  mesh.userData.variants = variants;
  const m = new Matrix4(), p = new Vector3(), s = new Vector3();
  list.forEach((b, i) => {
    p.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    s.set(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    mesh.setMatrixAt(i, m.makeScale(s.x, s.y, s.z).setPosition(p));
  });
  mesh.count = list.length;
  mesh.geometry.setAttribute('aAfter', new InstancedBufferAttribute(Float32Array.from({ length: Math.max(1, list.length) }, (_, i) => list[i]?.after ?? 0), 1));
  mesh.computeBoundingSphere();
  mesh.customDepthMaterial = boxDepthMaterial(uniforms);
  mesh.castShadow = mesh.receiveShadow = shadows;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// ---- flat surfaces ----------------------------------------------------------------------------
const SURFACE = /* glsl */`
uniform float uVis, uGrow, uTop, uShadeScale, uPitch, uWidth, uDir, uU;
uniform vec3 uSunDir, uHaze, uDeep, uCool, uHorizon;
uniform float uHorizonMix;
uniform sampler2D uTopMap;
uniform vec4 uBlocks[24];
uniform float uKinds[24];
varying vec3 vWorldP;
float hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float depthShade(float z) { return mix(.2, 1.0, exp(-max(uTop - z, 0.0) / uShadeScale)); }
// Box-filtered stripes: share of [x - fw/2, x + fw/2] covered by lines of width W every P.
float F(float x, float P, float W) { return floor(x / P) * W + min(mod(x, P), W); }
float stripe(float x, float P, float W) {
  float fw = max(fwidth(x), P * 1e-3);
  x -= P * .5 - W * .5; // lines centred on (k + 1/2) P, like the tracks
  float c = (F(x + fw * .5, P, W) - F(x - fw * .5, P, W)) / fw;
  // Near one period per pixel a box filter still beats against the pixel grid: go to the mean.
  return mix(c, W / P, smoothstep(.15 * P, .5 * P, fw));
}
// Segments along a track: cells of 12 pitches, some broken (like the routing's gaps).
// Smooth value noise for large, soft tonal variation (no visible cells).
float vnoise2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y); }
`;

/**
 * A flat textured quad. MODE 0: a level continued beyond its square (lines on dielectric);
 * 1: the transistor rows continued (fins and gates); 2: the die surface (floorplan, top metal,
 * pads, seal ring). Holes are complementary-dithered against the real geometry inside them.
 */
function surface(mode, { rect, hole = 0, z, inner = false, uniforms: extra = {} }) {
  const uniforms = { ...LIGHT, uVis: { value: 1 }, uGrow: { value: 1 }, uTop: { value: 1000 }, uShadeScale: { value: 300 }, uPitch: { value: 1 }, uWidth: { value: .5 },
    uDir: { value: 0 }, uBlocks: { value: Array.from({ length: 24 }, () => new Vector4(0, 0, 0, 0)) },
    uKinds: { value: new Array(24).fill(-1) }, uTopMap: { value: null }, ...extra };
  const make = dither => {
  const material = new MeshStandardMaterial({ color: '#ffffff', metalness: .5, roughness: .5, side: DoubleSide });
  material.defines = { MODE: mode, ...(dither ? { DITHER: 1 } : {}), ...(inner ? { INNER: 1 } : {}) };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
vec2 w = vWorldP.xy;
float h = hash2(gl_FragCoord.xy);
#ifdef INNER
// Over the real geometry: it owns the pixels it keeps (h < uVis), this surface the rest.
if (h < uVis) discard;
#endif
#ifdef DITHER
if (hash2(gl_FragCoord.yx + 17.0) >= uGrow) discard;
#endif
vec3 col; float metal, rough;
#if MODE == 0
  float c = stripe(uDir < .5 ? w.y : w.x, uPitch, uWidth);
  col = mix(vec3(.05, .06, .07), vec3(.56, .49, .44), c); metal = c; rough = .4;
#elif MODE == 1
  float fin = stripe(w.y, 42.0, 8.0), gate = stripe(w.x, 70.0, 36.0);
  col = mix(mix(vec3(.12, .15, .19), vec3(.5, .55, .6), fin), vec3(.58, .55, .5), gate * (1.0 - .2 * fin)); metal = .5; rough = .4;
#else
  // Die surface: floorplan blocks (memory arrays read as a fine regular grid, logic as a finer
  // irregular texture), the top metal as filtered lines, a pad ring and a seal ring.
  col = vec3(.07, .08, .095);
  float kind = -1.0;
  for (int i = 0; i < 24; i++) {
    vec4 b = uBlocks[i];
    if (w.x > b.x && w.y > b.y && w.x < b.z && w.y < b.w) kind = uKinds[i];
  }
  // Fine textures fade to their average once they go below a pixel (fwidth of the coordinate).
  float fine = 1.0 - smoothstep(700.0, 2500.0, fwidth(w.x));
  vec3 view = normalize(cameraPosition - vWorldP);
  float sheenK = 0.0, blockMetal = .5;
  if (kind > .5 && kind < 1.5) {
    // Memory: sub-arrays of bit cells in a regular grid, word-line/bit-line rhythm inside, a fine
    // neutral interference sheen that shifts with the view angle (regular gratings do this).
    float cells = stripe(w.x, 9000.0, 6500.0) * stripe(w.y, 5000.0, 3600.0);
    float bank = stripe(w.x, 9e4, 8.4e4) * stripe(w.y, 6e4, 5.6e4);
    col = mix(vec3(.07, .08, .095), vec3(.21, .23, .26), cells) * (.8 + .35 * bank);
    col += .05 * (.5 + .5 * cos(6.2831 * (view.z * 1.7 + vec3(0.0, .33, .67)))) * bank;
    blockMetal = .7;
  } else if (kind > 1.5) {
    // Analog / IO: a few large devices (capacitor and transistor arrays) in a coarse grid.
    col = mix(vec3(.09, .09, .1), vec3(.2, .19, .18), stripe(w.x, 2.4e4, 1.5e4) * stripe(w.y, 1.6e4, 1e4));
  } else if (kind > -.5) {
    // Logic: standard-cell rows separated by routing channels; inside the rows, the real routing
    // (the baked level under the top straps) at a quarter of its size, so it reads at this scale.
    vec2 ruv = .5 + (fract(w / 3.2e4) - .5) * ${(2 * LEVELS.at(-2).extent / (2 * LEVELS.at(-1).extent)).toFixed(4)};
    float routing = texture2D(uTopMap, ruv).g;
    float rows = stripe(w.y, 3.2e4, 2.6e4);
    col = mix(vec3(.06, .062, .066), mix(vec3(.08, .08, .085), vec3(.19, .17, .15), routing), rows) * (.9 + .2 * vnoise2(w / 6e4));
  }
  // Power grid: wide straps every 100 um in both directions, catching the sun.
  float grid = max(stripe(w.x, 1e5, 9000.0), stripe(w.y, 1e5, 9000.0)) * step(-.5, kind);
  // The top straps (every third track, unbroken) and the level below, exactly as routed.
  float top = stripe(w.y, ${(3 * LEVELS.at(-1).pitch).toFixed(1)}, ${LEVELS.at(-1).width.toFixed(1)});
  float below = stripe(w.x, ${LEVELS.at(-2).pitch.toFixed(1)}, ${LEVELS.at(-2).width.toFixed(1)}) * .8;
  vec2 tuv = w / ${(2 * LEVELS.at(-1).extent).toFixed(1)} + .5;
  if (max(abs(w.x), abs(w.y)) < ${LEVELS.at(-2).extent.toFixed(1)}) below = texture2D(uTopMap, tuv).g;
  vec3 copperTone = vec3(.37, .29, .22);
  col = mix(col, mix(col * .7, copperTone * .5, .5), below * .5);
  col = mix(col, mix(copperTone, vec3(.4), .35), max(top, grid * .8));
  vec2 e = min(w - vec2(${DIE.x[0].toFixed(1)}, ${DIE.y[0].toFixed(1)}), vec2(${DIE.x[1].toFixed(1)}, ${DIE.y[1].toFixed(1)}) - w);
  float edge = min(e.x, e.y);
  float ring = max((1.0 - smoothstep(2.6e4, 2.9e4, edge)) * smoothstep(1.8e4, 2.1e4, edge), (1.0 - smoothstep(4.0e4, 4.3e4, edge)) * smoothstep(3.5e4, 3.8e4, edge));
  float pads = (1.0 - smoothstep(1.4e5, 1.42e5, edge)) * smoothstep(7e4, 7.2e4, edge) * stripe(e.x < e.y ? w.y : w.x, 1.2e5, 7e4);
  col = mix(col, vec3(.55, .58, .62), ring * .8);
  col = mix(col, vec3(.7, .56, .44), pads);
  metal = mix(blockMetal, .8, max(top, grid)); rough = mix(.4, .3, max(top, grid));
#endif
float ao = depthShade(vWorldP.z);`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = col;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = metal; roughnessFactor = rough;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= ao * uCool; reflectedLight.indirectSpecular *= ao * uCool; reflectedLight.directDiffuse *= mix(1.0, ao, .6);')
      .replace('#include <fog_fragment>', FOG);
  };
  material.customProgramCacheKey = () => `scale-surface-${mode}-${dither ? 1 : 0}-${inner ? 1 : 0}`;
  return material;
  };
  // A ring (rect minus the square hole, as four rectangles) or, for `inner`, the hole itself:
  // no discard is needed for the shape, so the plain variant keeps early depth testing.
  const [x0, y0, x1, y1] = inner ? [-hole, -hole, hole, hole] : rect;
  const parts = inner || !hole ? [[x0, y0, x1, y1]] : [[x0, hole, x1, y1], [x0, y0, x1, -hole], [x0, -hole, -hole, hole], [hole, -hole, x1, hole]];
  const geometry = mergeGeometries(parts.filter(([a, b, c, d]) => c > a && d > b).map(([a, b, c, d]) => new PlaneGeometry(c - a, d - b).translate((a + c) / 2, (b + d) / 2, 0)));
  const variants = [make(false), make(true)];
  const mesh = new Mesh(geometry, variants[0]);
  mesh.position.z = z;
  mesh.receiveShadow = true;
  mesh.userData = { uniforms, variants };
  return mesh;
}

/** The two thick levels' segments as a texture over the real stack's square (for the die surface). */
function bakeTop(levels) {
  const size = 2048, E = LEVELS.at(-1).extent, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const px = v => (v / (2 * E) + .5) * size;
  for (const [level, color] of [[levels.at(-1), '#ff0000'], [levels.at(-2), '#00ff00']]) {
    ctx.fillStyle = color;
    // Texture rows run from the bottom (v = 0 at y = -E): flip y.
    for (const s of level.segments) ctx.fillRect(px(s.min[0]), size - px(s.max[1]), px(s.max[0]) - px(s.min[0]), px(s.max[1]) - px(s.min[1]));
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearMipmapLinearFilter; texture.anisotropy = 8;
  return texture;
}

export async function createScale({ renderer, environment, dof, shadows = true }) {
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1.3;
  scene.environmentRotation.set(Math.PI / 2, 0, -.6); // the studio HDR is Y-up, this scene Z-up
  scene.fog = new Fog(BG, 1, 10);
  const { levels } = route();
  const rows = transistorRows();
  const groups = [];
  const add = (mesh, level, pitch) => { groups.push({ mesh, level, pitch }); scene.add(mesh); };
  add(boxes(rows.fins, METALS.silicon, { shadows }), -1, 42);
  add(boxes(rows.gates, METALS.gate, { shadows }), -1, 42);
  add(boxes(rows.epi, METALS.epi, { shadows }), -1, 42);
  add(boxes(rows.contacts, METALS.tungsten, { shadows }), -1, 42);
  levels.forEach((level, i) => {
    const params = METALS[level.metal], liner = level.metal === 'lower' ? 0 : 1;
    add(boxes(level.segments, params, { liner, shadows }), i, level.pitch);
    if (level.vias.length) add(boxes(level.vias, params, { shadows }), i, level.pitch);
  });

  // Flat continuations: transistor rows on the oxide, each level beyond its square, the die.
  const E = LEVELS.at(-1).extent;
  const surfaces = [];
  // Each continuation is a ring around the real geometry plus an inner part that takes over pixel
  // by pixel as that geometry goes below a pixel.
  const addSurface = (mode, opts, info) => {
    surfaces.push({ ...info, inner: false, mesh: surface(mode, opts) });
    if (opts.hole) surfaces.push({ ...info, inner: true, mesh: surface(mode, { ...opts, inner: true }) });
  };
  addSurface(1, { rect: [-E, -E, E, E], hole: FEOL_EXTENT, z: 0 }, { level: -1, pitch: 42 });
  for (let k = 0; k < LEVELS.length - 1; k++) {
    const l = LEVELS[k], outer = LEVELS[k + 1].extent;
    if (outer <= l.extent) continue;
    const uniforms = () => ({ uPitch: { value: l.pitch }, uWidth: { value: l.width }, uDir: { value: l.dir === 'x' ? 0 : 1 } });
    addSurface(0, { rect: [-outer, -outer, outer, outer], hole: l.extent, z: l.top, uniforms: uniforms() }, { level: k, pitch: l.pitch });
  }
  const dieSize = [DIE.x[1] - DIE.x[0], DIE.y[1] - DIE.y[0]], dieCenter = [(DIE.x[0] + DIE.x[1]) / 2, (DIE.y[0] + DIE.y[1]) / 2];
  const topMap = bakeTop(levels);
  renderer.initTexture(topMap); // upload now, not on the first frame that sees the die
  addSurface(2, { rect: [DIE.x[0], DIE.y[0], DIE.x[1], DIE.y[1]], hole: E, z: STACK_TOP + 2, uniforms: { uTopMap: { value: topMap } } },
    { level: LEVELS.length - 1, pitch: LEVELS.at(-1).pitch, die: true });
  for (const s of surfaces) if (s.die) floorplan().forEach((b, i) => { s.mesh.userData.uniforms.uBlocks.value[i].set(b[0], b[1], b[2], b[3]); s.mesh.userData.uniforms.uKinds.value[i] = b[4]; });
  for (const s of surfaces) scene.add(s.mesh);
  // The die body under it all (its top hidden below the oxide), for the edges in the far view.
  const body = new Mesh(new BoxGeometry(dieSize[0], dieSize[1], DIE.thickness), new MeshStandardMaterial({ color: '#6a7078', metalness: .55, roughness: .45 }));
  body.position.set(dieCenter[0], dieCenter[1], -DIE.thickness / 2 - 2);
  scene.add(body);

  // One low warm sun: the amber accent, long shadows down the canyons.
  const sun = new DirectionalLight('#ffcfa0', 2.6);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  const camera = new PerspectiveCamera(30, 1, 1, 10);
  camera.up.set(0, 0, 1);
  let framing = 'desktop', size = [1, 1];
  // Compile both variants of everything now, so a hand-over never stalls on a shader compile.
  const all = [...groups, ...surfaces].map(g => g.mesh);
  for (const v of [1, 0]) { for (const m of all) m.material = m.userData.variants[v]; await dof.compile(scene, camera); }

  return {
    resize(width, height, nextFraming) { size = [width, height]; framing = nextFraming; },
    setShadows(on) {
      sun.castShadow = on;
      for (const g of groups) g.mesh.castShadow = g.mesh.receiveShadow = on;
    },
    /** state: { progress (chapter 03), time (ambient s), opacity }. Returns the scale bar. */
    render({ progress, time, opacity = 1 }) {
      const cam = scaleCamera(progress, framing, time * 2 * Math.PI / 90);
      const d = cam.d;
      camera.fov = cam.fov; camera.aspect = size[0] / size[1];
      camera.near = Math.min(d * .02, 150 + d * .008); camera.far = d * 60; // near stays short only at close range (depth precision)
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      // The reveal gets the low sun, more of it, and the horizon haze; inside the layers stays as is.
      const reveal = smoothstep(.42, .56, progress) * (1 - smoothstep(.64, .74, progress));
      LIGHT.uHorizonMix.value = reveal;
      scene.fog.near = d * (2.2 - .9 * LIGHT.uHorizonMix.value); scene.fog.far = d * (14 - 5 * LIGHT.uHorizonMix.value);

      // Darker the deeper below the viewer (and below the deposited top): canyons, not a black pit.
      const g = growth(progress), top = Math.min(buildHeight(progress), cam.position[2] + .3 * d), shade = .3 * top + 60;
      // Pixels per nm at the focal plane: a level whose pitch drops below ~2 px hands over to its
      // flat continuation (which filters it) instead of shimmering.
      const pxPerNm = size[1] / 2 / Math.tan(cam.fov * Math.PI / 360) / d;
      const vis = pitch => smoothstep(1.2, 3, pitch * pxPerNm);
      // The top level hands over to its baked twin on the die surface while still a few pixels wide.
      const visTop = smoothstep(4, 8, LEVELS.at(-1).pitch * pxPerNm);
      LIGHT.uU.value = progress;
      for (const { mesh, level, pitch } of groups) {
        const u = mesh.userData.uniforms, grow = level < 0 ? 1 : g[level];
        u.uGrow.value = Math.max(grow, 1e-3); u.uVis.value = level === LEVELS.length - 1 ? visTop : vis(pitch); u.uTop.value = top; u.uShadeScale.value = shade;
        mesh.visible = grow > 1e-3 && u.uVis.value > 1e-3;
        mesh.material = mesh.userData.variants[u.uVis.value < 1 ? 1 : 0];
      }
      for (const s of surfaces) {
        const u = s.mesh.userData.uniforms;
        u.uTop.value = top; u.uShadeScale.value = shade;
        u.uVis.value = s.die ? visTop : vis(s.pitch);
        u.uGrow.value = s.level < 0 ? 1 : g[s.level];
        s.mesh.visible = u.uGrow.value > 1e-3 && (!s.inner || u.uVis.value < 1);
        s.mesh.material = s.mesh.userData.variants[u.uGrow.value < 1 ? 1 : 0];
      }
      sunDir.copy(SUN).lerp(SUN_LOW, reveal).normalize();
      sun.intensity = 2.6 + 4.5 * reveal;
      scene.environmentIntensity = 1.3 + .6 * reveal;
      LIGHT.uHorizonMix.value = reveal;
      sun.target.position.set(...cam.target);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, d * 4);
      const sc = sun.shadow.camera, r = d * 1.4;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = d * .5; sc.far = d * 9;
      sc.updateProjectionMatrix();
      sun.shadow.bias = -.0004; sun.shadow.normalBias = d * .002;
      renderer.toneMappingExposure = 1.05 + .25 * reveal;
      dof.render(scene, camera, { focus: d, aperture: cam.aperture, opacity, farMax: 3.5 });
      return opacity > .6 ? { ...scaleBar(size[1], cam.fov, d, 90), scene: 'scale' } : null;
    },
    dispose() {
      for (const { mesh } of groups) { mesh.geometry.dispose(); mesh.customDepthMaterial.dispose(); }
      for (const { mesh } of surfaces) mesh.geometry.dispose();
      for (const m of all) for (const v of m.userData.variants) v.dispose();
      body.geometry.dispose(); body.material.dispose(); sun.shadow.map?.dispose(); topMap.dispose();
    },
  };
}
