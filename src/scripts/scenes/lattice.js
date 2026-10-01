/**
 * Chapter 01: inside the silicon crystal. The hero's fracture face dissolves into the diamond-cubic
 * lattice, then a crystallisation front turns seeded polycrystal grains into one monocrystal.
 * Ball-and-stick, instanced; the per-atom blend between the grain pose and the perfect lattice
 * runs in the vertex shader from a few uniforms, so scrolling never rebuilds buffers.
 * Lit by the hero's studio environment (MeshStandardMaterial, patched), depth through fog to the
 * page background. Atoms are camera-facing sphere impostors: exact round silhouettes at any size
 * for two triangles each, shaded with a per-pixel sphere normal.
 */
import {
  Color, CustomBlending, CylinderGeometry, Fog, OneMinusSrcAlphaFactor, SrcAlphaFactor, InstancedBufferAttribute, InstancedBufferGeometry, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, Vector4,
} from 'three';
import { buildLattice, latticeCamera, latticeFront, scaleBar, BOND, CHANNEL_DIR, FOCUS } from './lattice-math.js';
import { smoothstep } from '../story/timeline.js';

const BG = new Color('#0b0e12');
const BG_SRGB = [11 / 255, 14 / 255, 18 / 255]; // raw shader output is already sRGB
/** Level of detail per profile lod: fog distance in nm (the block is cut to what the fog lets through). */
const LOD = { high: { far: 4.4 }, low: { far: 3.8 } };
const ATOM_RADIUS = .022, BOND_RADIUS = .0045, BAND = .3, EXPOSURE = 1;
/**
 * Depth of field: one sharp plane at FOCUS (the plane the scale bar is true for). Thin lens: the
 * blur, measured as a radius in the scene at the object's own depth, is APERTURE * |z - focus| / focus.
 */
const APERTURE = .07;
const AMBER = new Color('#d98a4a'); // redder than the CSS amber: dimmed by fog it turns brown, not olive

// Shared vertex code: lattice position -> current position for the front and grain pose.
const COMMON = /* glsl */`
uniform vec4 uFront; uniform float uBand, uHeat, uTime, uRadius, uBond, uFocus, uAperture;
varying float vHeat, vOrder, vSharp;
float blurAt(float z) { return uAperture * abs(z - uFocus) / uFocus; }
vec3 rotateAxis(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
// t: 1 behind the front (monocrystal), 0 ahead of it (grain pose).
vec3 placeAtom(vec3 lattice, vec3 centre, vec4 rot, float seed, out float t, out float heat) {
  float d = dot(lattice, uFront.xyz) - uFront.w;
  t = 1.0 - smoothstep(-uBand, uBand, d);
  heat = exp(-d * d / .02) * uHeat; // the hot band (~0.1 nm) is narrower than the blend
  vec3 p = centre + rotateAxis(lattice - centre, rot.xyz, rot.w * (1.0 - t));
  // Agitation in the hot band only: a liquid-like jitter, on the ambient clock.
  return p + heat * .03 * sin(vec3(3.1, 2.7, 3.7) * uTime + seed * vec3(40.0, 17.0, 29.0));
}
// The camera sits in a clearing: atoms nearer than ~1 nm shrink away instead of filling the lens.
float nearFade(vec3 p) { return smoothstep(.45, .95, distance(p, cameraPosition)); }
`;

const FOG = /* glsl */`
#ifdef USE_FOG
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  BOND_FOG
  // Veils: the side of the frame with the heading, and a floor band under the labels, recede
  // into the background. uVeil: from, to (fraction of the frame), axis (1: from the left,
  // 0: from the top), strength. uFloor: from, to (fraction from the bottom), strength.
  vec2 frag = gl_FragCoord.xy / uViewport;
  fogFactor = max(fogFactor, uVeil.w * (1.0 - smoothstep(uVeil.x, uVeil.y, mix(1.0 - frag.y, frag.x, uVeil.z))));
  fogFactor = max(fogFactor, uFloor.z * (1.0 - smoothstep(uFloor.x, uFloor.y, frag.y)));
  // Mild lens falloff around the vanishing point (uCentre: its position in the frame).
  fogFactor = max(fogFactor, .45 * smoothstep(.3, .85, length((frag - uCentre) * vec2(uViewport.x / uViewport.y, 1.0))));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

function patch(material, uniforms, key, code) {
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${code.head}`)
      .replace('#include <beginnormal_vertex>', code.normal)
      .replace('#include <begin_vertex>', code.position)
      .replace('#include <project_vertex>', code.project ?? '#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vHeat, vOrder, vSharp;\nuniform vec3 uAmber; uniform vec2 uViewport; uniform vec4 uVeil; uniform vec3 uFloor; uniform vec2 uCentre;\n${code.fragmentHead ?? ''}`)
      .replace('#include <normal_fragment_begin>', code.fragmentNormal ?? '#include <normal_fragment_begin>')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(.5, 1.0, vOrder); // the ordered crystal reads brighter')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uAmber * vHeat * 1.8;')
      .replace('#include <fog_fragment>', FOG.replace('BOND_FOG', code.fog ?? ''));
  };
  return material;
}

const ATOM_SHADER = {
  head: 'attribute vec3 aLattice, aCentre; attribute vec4 aRot; attribute vec2 aInfo; varying vec2 vImp; varying vec3 vU, vV, vW;',
  normal: `float t, heat; vec3 centreNow = placeAtom(aLattice, aCentre, aRot, aInfo.y, t, heat);
    vHeat = heat; vOrder = t; vec3 objectNormal = vec3(0.0, 0.0, 1.0);`,
  position: 'vec3 transformed = centreNow;',
  // Quad facing the camera, pushed forward by the radius so bonds end inside the sphere, grown by
  // the blur radius. vSharp: share of the quad that is the sharp core of the sphere.
  project: `vec4 mvCentre = modelViewMatrix * vec4(centreNow, 1.0);
    float r = uRadius * mix(aInfo.x, 1.0, t) * nearFade(centreNow);
    float size = r + blurAt(-mvCentre.z);
    vSharp = r / max(size, 1e-6);
    vW = normalize(-mvCentre.xyz); vU = normalize(cross(vec3(0.0, 1.0, 0.0), vW)); vV = cross(vW, vU); vImp = position.xy;
    vec4 mvPosition = vec4(mvCentre.xyz + (vU * position.x + vV * position.y) * size + vW * r, 1.0);
    gl_Position = projectionMatrix * mvPosition;`,
  fragmentHead: 'varying vec2 vImp; varying vec3 vU, vV, vW;',
  // Sharp sphere in focus; out of focus a soft disc whose light is spread over the blur
  // (alpha ~ (r / size)^1.4, a little brighter than strict energy conservation).
  fragmentNormal: `float rho = length(vImp);
    float inner = min(2.0 * vSharp - 1.0, 1.0 - 1.5 * fwidth(rho));
    float alpha = (1.0 - smoothstep(inner, 1.0, rho)) * pow(vSharp, 1.4);
    if (alpha < .004) discard;
    diffuseColor.a *= alpha;
    vec2 q = vImp / max(vSharp, .05);
    float qq = min(dot(q, q), 1.0);
    float faceDirection = 1.0;
    vec3 normal = normalize(vU * q.x + vV * q.y + vW * sqrt(1.0 - qq));
    vec3 nonPerturbedNormal = normal;`,
};
const BOND_SHADER = {
  head: 'attribute vec3 aA, aB, aCentreA, aCentreB; attribute vec4 aRotA, aRotB; attribute float aShow;',
  normal: `float ta, tb, ha, hb; vec3 pa = placeAtom(aA, aCentreA, aRotA, 0.0, ta, ha), pb = placeAtom(aB, aCentreB, aRotB, 0.0, tb, hb);
    vec3 axis = pb - pa, dir = normalize(axis);
    vec3 side = normalize(cross(dir, abs(dir.z) < .9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0))), bi = cross(dir, side);
    // Bonds stretched across the front (one end still in its grain pose) are not bonds: hide them.
    float show = mix(aShow, 1.0, smoothstep(.6, .95, min(ta, tb))) * min(nearFade(pa), nearFade(pb)) * (1.0 - smoothstep(1.08, 1.3, length(axis) / uBond));
    vHeat = .8 * max(ha, hb); vOrder = min(ta, tb);
    vSharp = uRadius / (uRadius + blurAt(-(modelViewMatrix * vec4(.5 * (pa + pb), 1.0)).z));
    // Well out of focus a bond thins away (a fogged but opaque bar would read as a dark stripe).
    show *= smoothstep(.1, .3, vSharp);
    vec3 objectNormal = side * normal.x + bi * normal.z;`,
  position: 'vec3 transformed = pa + axis * position.y + (side * position.x + bi * position.z) * uRadius * show;',
  // Thin bonds cannot blur cheaply: out of focus they recede into the background instead (this
  // also keeps far bonds from aliasing into flicker).
  fog: 'fogFactor = max(fogFactor, 1.0 - smoothstep(.12, .6, vSharp));',
};

function instanced(base, count, attributes) {
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('normal', base.getAttribute('normal'));
  for (const [name, [array, size]] of Object.entries(attributes)) geometry.setAttribute(name, new InstancedBufferAttribute(array, size));
  geometry.instanceCount = count;
  return geometry;
}

/** Per-instance grain data of the given atoms: centre (3) and rotation (axis 3, angle 1). */
function grainArrays(lattice, atoms) {
  const centre = new Float32Array(atoms.length * 3), rot = new Float32Array(atoms.length * 4);
  atoms.forEach((atom, i) => {
    const g = lattice.grains[lattice.grain[atom]];
    centre.set(g.centre, i * 3); rot.set([...g.axis, g.angle], i * 4);
  });
  return { centre, rot };
}

function buildMeshes(lattice, atomMaterial, bondMaterial) {
  const n = lattice.positions.length, m = lattice.pairs.length;
  // Blurred atoms are blended: draw them far to near along the viewing axis (the camera always
  // looks roughly along +[110]), so soft discs composite in order without a per-frame sort.
  const depth = lattice.positions.map(p => p[0] * CHANNEL_DIR[0] + p[1] * CHANNEL_DIR[1] + p[2] * CHANNEL_DIR[2]);
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => depth[j] - depth[i]);
  const atoms = grainArrays(lattice, order);
  const info = new Float32Array(n * 2);
  order.forEach((atom, i) => { info[2 * i] = lattice.visible[atom]; info[2 * i + 1] = lattice.hashes[atom]; });
  const quad = new PlaneGeometry(2, 2);
  const atomGeometry = instanced(quad, n, {
    aLattice: [Float32Array.from(order.flatMap(i => lattice.positions[i])), 3], aCentre: [atoms.centre, 3], aRot: [atoms.rot, 4], aInfo: [info, 2],
  });
  const cylinder = new CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, .5, 0);
  const a = grainArrays(lattice, lattice.pairs.map(([i]) => i)), b = grainArrays(lattice, lattice.pairs.map(([, j]) => j));
  const bondGeometry = instanced(cylinder, m, {
    aA: [Float32Array.from(lattice.pairs.flatMap(([i]) => lattice.positions[i])), 3],
    aB: [Float32Array.from(lattice.pairs.flatMap(([, j]) => lattice.positions[j])), 3],
    aCentreA: [a.centre, 3], aRotA: [a.rot, 4], aCentreB: [b.centre, 3], aRotB: [b.rot, 4],
    aShow: [Float32Array.from(lattice.bondVisible), 1],
  });
  quad.dispose(); cylinder.dispose();
  const meshes = [new Mesh(atomGeometry, atomMaterial), new Mesh(bondGeometry, bondMaterial)];
  for (const mesh of meshes) mesh.frustumCulled = false;
  return meshes;
}

export async function createLattice({ renderer, environment, seed = 14 }) {
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1;
  scene.fog = new Fog(BG, 1, LOD.high.far);
  const shared = {
    uFront: { value: new Vector4() }, uBand: { value: BAND }, uFocus: { value: FOCUS }, uAperture: { value: APERTURE }, uBond: { value: BOND }, uHeat: { value: 0 }, uTime: { value: 0 },
    uAmber: { value: AMBER }, uViewport: { value: new Vector2(1, 1) }, uVeil: { value: new Vector4() }, uFloor: { value: new Vector3() }, uCentre: { value: new Vector2() },
  };
  const atomMaterial = patch(new MeshStandardMaterial({ color: '#b3bcc6', metalness: .45, roughness: .38, transparent: true }),
    { ...shared, uRadius: { value: ATOM_RADIUS } }, 'lattice-atom', ATOM_SHADER);
  const bondMaterial = patch(new MeshStandardMaterial({ color: '#7a848f', metalness: .5, roughness: .5 }),
    { ...shared, uRadius: { value: BOND_RADIUS } }, 'lattice-bond', BOND_SHADER);
  // Dims whatever is already in the frame (the hero's face) to the page background. First in the
  // opaque list (custom blending keeps it there), so everything of the lattice draws over it.
  const dim = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: { uColor: { value: new Vector4() } }, depthWrite: false, depthTest: false,
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, .99999, 1.0); }',
    fragmentShader: 'uniform vec4 uColor; void main() { gl_FragColor = uColor; }',
  }));
  dim.frustumCulled = false; dim.renderOrder = -1;
  scene.add(dim);

  const camera = new PerspectiveCamera(40, 1, .02, LOD.high.far + 1);
  camera.up.set(0, 0, 1);
  let key = '', lattice = null, meshes = [], framing = 'desktop', size = [1, 1], far = LOD.high.far;
  const target = new Vector3(), forward = new Vector3();

  function rebuild(nextFraming, lod) {
    if (`${nextFraming}/${lod}` === key) return;
    key = `${nextFraming}/${lod}`; framing = nextFraming; far = LOD[lod].far;
    for (const mesh of meshes) { scene.remove(mesh); mesh.geometry.dispose(); }
    lattice = buildLattice({ seed, framing, far });
    meshes = buildMeshes(lattice, atomMaterial, bondMaterial);
    scene.add(...meshes);
    camera.far = far + 1;
  }
  rebuild('desktop', 'high');
  await renderer.compileAsync(scene, camera);

  function project(cam) {
    camera.fov = cam.fov;
    camera.aspect = size[0] / size[1];
    camera.updateProjectionMatrix();
    // Lens shift: parallel lines converge beside the heading instead of behind it.
    camera.projectionMatrix.elements[8] = -cam.shift[0];
    camera.projectionMatrix.elements[9] = -cam.shift[1];
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  return {
    resize(width, height, nextFraming, lod) { size = [width, height]; rebuild(nextFraming, lod); },
    /**
     * state: { u: lattice progress, time: ambient seconds, emerge: 0..1 (fog opens from the
     * background), fade: 0..1 (dims what is already drawn), over: draw on top of the frame }.
     * Returns the scale bar for the current camera, or null while the lattice is not readable.
     */
    render({ u, time, emerge, fade = 0, over = false }) {
      const cam = latticeCamera(u, framing, time * 2 * Math.PI / 70);
      project(cam);
      camera.position.set(...cam.position);
      camera.lookAt(target.copy(camera.position).addScaledVector(forward.set(...cam.forward), FOCUS));
      const f = latticeFront(u);
      shared.uFront.value.set(...f.normal, f.offset);
      shared.uHeat.value = f.heat;
      shared.uTime.value = time;
      renderer.getDrawingBufferSize(shared.uViewport.value);
      if (framing === 'mobile') { shared.uVeil.value.set(.36, .6, 0, .85); shared.uFloor.value.set(.2, .4, .85); }
      else { shared.uVeil.value.set(.28, .56, 1, .85); shared.uFloor.value.set(.2, .38, .85); }
      shared.uCentre.value.set(.5 + cam.shift[0] / 2, .5 + cam.shift[1] / 2);
      // While the lattice emerges the focus racks from the nearest grain (1.1 nm) out to FOCUS;
      // it is there before the scale bar appears (emerge > .6), so the bar is always true.
      shared.uFocus.value = 1.1 + (FOCUS - 1.1) * smoothstep(0, .6, emerge);
      scene.fog.near = .5 + .9 * emerge;
      scene.fog.far = 1.3 + (far - 1.3) * emerge;
      dim.material.uniforms.uColor.value.set(...BG_SRGB, fade);
      dim.visible = over;
      renderer.toneMappingExposure = EXPOSURE;
      if (over) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(scene, camera);
        renderer.autoClear = true;
      } else {
        renderer.setClearColor(BG, emerge);
        renderer.render(scene, camera);
        renderer.setClearColor(0x000000, 0);
      }
      return emerge > .6 ? scaleBar(size[1], cam.fov) : null;
    },
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      atomMaterial.dispose(); bondMaterial.dispose(); dim.geometry.dispose(); dim.material.dispose();
    },
    get count() { return { atoms: lattice.positions.length, bonds: lattice.pairs.length }; },
  };
}
