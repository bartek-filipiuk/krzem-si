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
  BoxGeometry, Color, DirectionalLight, DoubleSide, Fog, InstancedMesh, Matrix4, MeshDepthMaterial,
  MeshStandardMaterial, Mesh, PerspectiveCamera, PlaneGeometry, RGBADepthPacking, Scene, Vector3, Vector4,
} from 'three';
import { DIE, FEOL_EXTENT, LEVELS, STACK_TOP, buildHeight, floorplan, growth, route, scaleCamera, transistorRows } from './scale-math.js';
import { scaleBar } from './lattice-math.js';
import { smoothstep } from '../story/timeline.js';

const BG = new Color('#0b0e12');
const METALS = {
  lower: { color: '#8b9198', metalness: .85, roughness: .42 },   // cobalt/tungsten-like, cool
  copper: { color: '#9a8679', metalness: .85, roughness: .36 },  // copper, muted toward grey
  thick: { color: '#a3917f', metalness: .75, roughness: .4 },
  silicon: { color: '#8a939c', metalness: .6, roughness: .38 },
  gate: { color: '#a59d92', metalness: .85, roughness: .32 },
  epi: { color: '#9aa3ac', metalness: .5, roughness: .36 },
  tungsten: { color: '#7d848b', metalness: .6, roughness: .5 },
};
const SUN = new Vector3(.8, -.35, .42).normalize();
/** Shared by every material of the scene (same objects, so one update reaches all). */
const LIGHT = { uSunDir: { value: SUN }, uHaze: { value: new Color('#3d3029') } };

const FOG = /* glsl */`
#ifdef USE_FOG
  // Distance fog, lit warm toward the low sun (light scattered in the haze down an avenue).
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  float glow = pow(max(dot(normalize(vWorldP - cameraPosition), uSunDir), 0.0), 5.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, uHaze, glow), fogFactor);
#endif
`;
const COMMON = /* glsl */`
uniform float uVis, uGrow, uTop, uLiner, uShadeScale;
uniform vec3 uSunDir, uHaze;
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
function boxMaterial(params, uniforms) {
  const material = new MeshStandardMaterial({ ...params });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.z = (transformed.z + .5) * uGrow - .5;
vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vHalf = size * vec3(.5, .5, .5 * uGrow);
vLocal = vec3(transformed.xy, transformed.z - (uGrow - 1.0) * .5) * size;
vWorldP = (instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (hash2(gl_FragCoord.xy) >= uVis) discard;
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
float wear = 1.0 - smoothstep(0.0, r * 1.2, edge);
float grain = vnoise(vWorldP / (lineW * vec3(1.6, 1.6, .9) + 1e-3)) - .5;
float ao = depthShade(vWorldP.z) * (abs(nWorld.z) < .5 ? mix(.55, 1.0, smoothstep(0.0, vHalf.z * 1.4, vLocal.z + vHalf.z)) : 1.0);`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= (1.0 + grain * .07) * (1.0 + .18 * wear) * (1.0 - .7 * liner);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (1.0 + grain * .3) + liner * .3, .05, 1.0);')
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= ao; reflectedLight.indirectSpecular *= ao; reflectedLight.directDiffuse *= mix(1.0, ao, .6); reflectedLight.directSpecular *= mix(1.0, ao, .6);')
      .replace('#include <fog_fragment>', FOG);
  };
  material.customProgramCacheKey = () => 'scale-box';
  return material;
}

/** Shadow depth that grows like the boxes. */
function boxDepthMaterial(uniforms) {
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGrow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z = (transformed.z + .5) * uGrow - .5;');
  };
  material.customProgramCacheKey = () => 'scale-box-depth';
  return material;
}

function boxes(list, params, { liner = 0, shadows } = {}) {
  const uniforms = { uVis: { value: 1 }, uGrow: { value: 1 }, uTop: { value: 1000 }, uShadeScale: { value: 300 }, uLiner: { value: liner }, ...LIGHT };
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), boxMaterial(params, uniforms), Math.max(1, list.length));
  const m = new Matrix4(), p = new Vector3(), s = new Vector3();
  list.forEach((b, i) => {
    p.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    s.set(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    mesh.setMatrixAt(i, m.makeScale(s.x, s.y, s.z).setPosition(p));
  });
  mesh.count = list.length;
  mesh.computeBoundingSphere();
  mesh.customDepthMaterial = boxDepthMaterial(uniforms);
  mesh.castShadow = mesh.receiveShadow = shadows;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// ---- flat surfaces ----------------------------------------------------------------------------
const SURFACE = /* glsl */`
uniform float uVis, uGrow, uTop, uShadeScale, uHole, uPitch, uWidth, uDir, uInner;
uniform vec3 uSunDir, uHaze;
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
  return (F(x + fw * .5, P, W) - F(x - fw * .5, P, W)) / fw;
}
`;

/**
 * A flat textured quad. MODE 0: a level continued beyond its square (lines on dielectric);
 * 1: the transistor rows continued (fins and gates); 2: the die surface (floorplan, top metal,
 * pads, seal ring). Holes are complementary-dithered against the real geometry inside them.
 */
function surface(mode, { size, center = [0, 0], z, uniforms: extra = {} }) {
  const uniforms = { ...LIGHT, uVis: { value: 1 }, uGrow: { value: 1 }, uTop: { value: 1000 }, uShadeScale: { value: 300 }, uHole: { value: 0 }, uPitch: { value: 1 }, uWidth: { value: .5 },
    uDir: { value: 0 }, uInner: { value: 0 }, uBlocks: { value: Array.from({ length: 24 }, () => new Vector4(0, 0, 0, 0)) },
    uKinds: { value: new Array(24).fill(-1) }, ...extra };
  const material = new MeshStandardMaterial({ color: '#ffffff', metalness: .5, roughness: .5, side: DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = { ...shader.defines, MODE: mode };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
vec2 w = vWorldP.xy;
float h = hash2(gl_FragCoord.xy);
bool inHole = abs(w.x) < uHole && abs(w.y) < uHole;
// Inside the hole the real geometry owns the pixels it keeps (h < uVis); this surface the rest.
if (inHole && h < uVis) discard;
if (hash2(gl_FragCoord.yx + 17.0) >= uGrow) discard;
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
  float fine = 1.0 - smoothstep(1500.0, 6000.0, fwidth(w.x));
  // Memory: sub-arrays in a regular grid (visible from millimetres), logic: an irregular tone.
  if (kind > .5 && kind < 1.5) col = mix(vec3(.07, .075, .085), vec3(.17, .18, .2), stripe(w.x, 9000.0, 6500.0) * stripe(w.y, 5000.0, 3600.0)) * (.75 + .5 * stripe(w.x, 9e4, 8e4) * stripe(w.y, 6e4, 5.2e4));
  else if (kind > 1.5) col = vec3(.1, .095, .095);
  else if (kind > -.5) col = mix(vec3(.085), mix(vec3(.06, .065, .075), vec3(.12, .13, .145), hash2(floor(w / 3000.0))), fine) * (.85 + .3 * hash2(floor(w / 4e4)));
  float top = stripe(w.y, ${LEVELS.at(-1).pitch.toFixed(1)}, ${LEVELS.at(-1).width.toFixed(1)});
  col = mix(col, vec3(.5, .44, .39), top * .3);
  vec2 e = min(w - vec2(${DIE.x[0].toFixed(1)}, ${DIE.y[0].toFixed(1)}), vec2(${DIE.x[1].toFixed(1)}, ${DIE.y[1].toFixed(1)}) - w);
  float ring = (1.0 - smoothstep(2.4e4, 3.2e4, min(e.x, e.y))) * smoothstep(1.2e4, 1.6e4, min(e.x, e.y));
  float pads = (1.0 - smoothstep(1.4e5, 1.45e5, min(e.x, e.y))) * smoothstep(6.5e4, 7e4, min(e.x, e.y)) * stripe(e.x < e.y ? w.y : w.x, 1.2e5, 7e4);
  col = mix(col, vec3(.55, .58, .62), ring * .8);
  col = mix(col, vec3(.7, .56, .44), pads);
  metal = .5 + .4 * top; rough = .35;
  // Over the real 3D stack the die surface takes over only as the stack goes below a pixel.
  if (abs(w.x) < ${LEVELS.at(-1).extent.toFixed(1)} && abs(w.y) < ${LEVELS.at(-1).extent.toFixed(1)} && h >= uInner) discard;
#endif
float ao = depthShade(vWorldP.z);`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = col;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = metal; roughnessFactor = rough;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= ao; reflectedLight.indirectSpecular *= ao; reflectedLight.directDiffuse *= mix(1.0, ao, .6);')
      .replace('#include <fog_fragment>', FOG);
  };
  material.customProgramCacheKey = () => `scale-surface-${mode}`;
  const mesh = new Mesh(new PlaneGeometry(size[0], size[1]), material);
  mesh.position.set(center[0], center[1], z);
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uniforms;
  return mesh;
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
  const ground = surface(1, { size: [2 * E, 2 * E], z: 0, uniforms: { uHole: { value: FEOL_EXTENT } } });
  surfaces.push({ mesh: ground, level: -1, pitch: 42 });
  for (let k = 0; k < LEVELS.length - 1; k++) {
    const l = LEVELS[k], outer = LEVELS[k + 1].extent;
    if (outer <= l.extent) continue;
    surfaces.push({ level: k, pitch: l.pitch, mesh: surface(0, { size: [2 * outer, 2 * outer], z: l.top, uniforms: {
      uHole: { value: l.extent }, uPitch: { value: l.pitch }, uWidth: { value: l.width }, uDir: { value: l.dir === 'x' ? 0 : 1 } } }) });
  }
  const dieSize = [DIE.x[1] - DIE.x[0], DIE.y[1] - DIE.y[0]], dieCenter = [(DIE.x[0] + DIE.x[1]) / 2, (DIE.y[0] + DIE.y[1]) / 2];
  const die = surface(2, { size: dieSize, center: dieCenter, z: STACK_TOP + 2 });
  floorplan().forEach((b, i) => { die.userData.uniforms.uBlocks.value[i].set(b[0], b[1], b[2], b[3]); die.userData.uniforms.uKinds.value[i] = b[4]; });
  surfaces.push({ mesh: die, level: LEVELS.length - 1, pitch: LEVELS.at(-1).pitch, die: true });
  for (const s of surfaces) scene.add(s.mesh);
  // The die body under it all (its top hidden below the oxide), for the edges in the far view.
  const body = new Mesh(new BoxGeometry(dieSize[0], dieSize[1], DIE.thickness), new MeshStandardMaterial({ color: '#3a4048', metalness: .6, roughness: .5 }));
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
  await renderer.compileAsync(scene, camera);

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
      camera.near = d * .02; camera.far = d * 60;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      scene.fog.near = d * 1.8; scene.fog.far = d * 10;

      // Darker the deeper below the viewer (and below the deposited top): canyons, not a black pit.
      const g = growth(progress), top = Math.min(buildHeight(progress), cam.position[2] + .3 * d), shade = .3 * top + 60;
      // Pixels per nm at the focal plane: a level whose pitch drops below ~2 px hands over to its
      // flat continuation (which filters it) instead of shimmering.
      const pxPerNm = size[1] / 2 / Math.tan(cam.fov * Math.PI / 360) / d;
      const vis = pitch => smoothstep(1.2, 3, pitch * pxPerNm);
      for (const { mesh, level, pitch } of groups) {
        const u = mesh.userData.uniforms, grow = level < 0 ? 1 : g[level];
        u.uGrow.value = Math.max(grow, 1e-3); u.uVis.value = vis(pitch); u.uTop.value = top; u.uShadeScale.value = shade;
        mesh.visible = grow > 1e-3 && u.uVis.value > 1e-3;
      }
      for (const s of surfaces) {
        const u = s.mesh.userData.uniforms;
        u.uTop.value = top; u.uShadeScale.value = shade;
        u.uVis.value = vis(s.pitch);
        u.uGrow.value = s.level < 0 ? 1 : g[s.level];
        if (s.die) u.uInner.value = 1 - vis(s.pitch);
        s.mesh.visible = u.uGrow.value > 1e-3;
      }
      sun.target.position.set(...cam.target);
      sun.position.copy(sun.target.position).addScaledVector(SUN, d * 4);
      const sc = sun.shadow.camera, r = d * 1.4;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = d * .5; sc.far = d * 9;
      sc.updateProjectionMatrix();
      sun.shadow.bias = -.0004; sun.shadow.normalBias = d * .002;
      renderer.toneMappingExposure = 1.05;
      dof.render(scene, camera, { focus: d, aperture: cam.aperture, opacity });
      return opacity > .6 ? { ...scaleBar(size[1], cam.fov, d, 90), scene: 'scale' } : null;
    },
    dispose() {
      for (const { mesh } of groups) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.customDepthMaterial.dispose(); }
      for (const { mesh } of surfaces) { mesh.geometry.dispose(); mesh.material.dispose(); }
      body.geometry.dispose(); body.material.dispose(); sun.shadow.map?.dispose();
    },
  };
}
