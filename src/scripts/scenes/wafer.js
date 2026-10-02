/**
 * Chapter 01's exit: the crystal's cut (001) face and the 300 mm wafer it belongs to (wafer-math.js).
 * One reflective material for the whole surface: while the atoms of the top layer are larger than
 * a few pixels it draws them per pixel (the same face-centred pattern and bonds as the instanced
 * lattice, which hands over to it), and as their footprint drops below a pixel it becomes the
 * polished silicon mirror, reflecting the studio. A small patch around the atoms carries the
 * pattern (float precision); the disc with its notch carries the mirror out to the edge.
 */
import {
  BackSide, Color, DirectionalLight, Vector2, Vector4, ExtrudeGeometry, Fog, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, Shape, ShaderMaterial, SphereGeometry,
} from 'three';
import { SURFACE_PITCH, SURFACE_Z, WAFER, waferOutline } from './wafer-math.js';
import { scaleBar } from './lattice-math.js';

const BG = new Color('#0b0e12');
/** Camera distance (nm) below which the surface is drawn on the square under the camera, not the disc. */
const NEAR_D = 3e5;

/**
 * What the mirror reflects: a dim dome, darker towards the horizon, and one long soft light above
 * the far side, the way a wafer is photographed. The studio of the other chapters is mostly black
 * with small softboxes: in a mirror that reads as a black disc with a few white spots.
 */
function waferStudio(renderer) {
  const room = new Scene();
  const dome = new Mesh(new SphereGeometry(10, 64, 32), new ShaderMaterial({
    side: BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD;
      void main() {
        float e = vD.z, a = atan(vD.y, vD.x);
        vec3 c = mix(vec3(.004, .005, .007), vec3(.035, .042, .055), smoothstep(0.0, .9, e));
        // One long, soft light where the mirror reflects the sky in the middle of the frame (the
        // pull-back looks down about 40 degrees along azimuth ~.4): a broad band across the wafer.
        float band = smoothstep(.9, .2, abs(a - .4)) * smoothstep(.45, .65, e) * smoothstep(1.15, .85, e);
        // Two crisp strip lights across it: in a mirror their sharp edges say "polished".
        float strip = (1.0 - smoothstep(.006, .012, abs(e - .66))) + (1.0 - smoothstep(.006, .012, abs(e - .86)));
        strip *= smoothstep(.7, .45, abs(a - .4));
        gl_FragColor = vec4(c + vec3(.3, .33, .38) * band + vec3(1.6, 1.65, 1.75) * strip, 1.0);
      }`,
  }));
  room.add(dome);
  const pmrem = new PMREMGenerator(renderer), target = pmrem.fromScene(room, 0, .1, 100);
  pmrem.dispose(); dome.geometry.dispose(); dome.material.dispose();
  return target;
}
/** The lattice's ball-and-stick sizes (lattice.js), so the hand-over keeps the same picture. */
const ATOM_R = .03, BOND_R = .006;

const HEAD = /* glsl */`
varying vec3 vWorldPos;
uniform float uPitch, uAtom, uBond;
uniform vec3 uMirror;
uniform vec4 uVeil; uniform vec2 uViewport;
`;
// Per pixel: the top layer's atoms (s, t: along [110] and [1-10], in pitches), the layer below
// between them, the bonds along t, and how readable they are at this pixel's footprint.
const PATTERN = /* glsl */`
vec2 st = vec2(vWorldPos.x + vWorldPos.y, vWorldPos.x - vWorldPos.y) * .70710678 / uPitch;
// Clamped: far out on the disc (coordinates ~1e8 nm in float) the derivative can be infinite,
// and smoothstep(-inf, inf, x) is NaN on some GPUs (a black frame through the depth of field).
float fpx = clamp(length(fwidth(st)), 1e-6, 8.0);
float R = uAtom / uPitch, BR = uBond / uPitch;
float pA = 1.0 - smoothstep(R * .6, R * 1.7, fpx);
// Four layers seen from above, each a quarter cell lower: (0,0), (0,.5), (.5,.5), (.5,0).
vec2 offs[4] = vec2[4](vec2(0.0), vec2(0.0, .5), vec2(.5), vec2(.5, 0.0));
float shades[4] = float[4](1.0, .62, .4, .27);
float cov = 0.0, shade = 0.0; vec2 q = vec2(0.0);
for (int i = 0; i < 4; i++) {
  vec2 g = st - offs[i], o = g - floor(g + .5);
  float r = R * (1.0 - .08 * float(i)), c = 1.0 - smoothstep(r - fpx, r + fpx, length(o));
  if (c > cov * 1.05) { cov = c; shade = shades[i]; q = o / r; }
}
// Bonds: layer 0 to 1 along t (through the top atoms), layer 1 to 2 along s, dimmer.
vec2 o1 = st - floor(st + .5), o2 = (st - vec2(0.0, .5)) - floor(st - vec2(0.0, .5) + .5);
float b1 = (1.0 - smoothstep(BR - fpx, BR + fpx, abs(o1.x))), b2 = (1.0 - smoothstep(BR - fpx, BR + fpx, abs(o2.y)));
float bond = max(b1 * .8, b2 * .45) * (1.0 - cov);
float qq = min(dot(q, q), 1.0);
vec3 nst = normalize(vec3(q, sqrt(1.0 - qq)));
vec3 nWorld = normalize(vec3((nst.x + nst.y) * .70710678, (nst.x - nst.y) * .70710678, nst.z));
if (bond > cov) { shade = max(b1 * .8, b2 * .45); nWorld = vec3(0.0, 0.0, 1.0); }
cov = max(cov, bond);
`;

const VEIL = { value: new Vector4() }, VIEWPORT = { value: new Vector2(1, 1) };
function surfaceMaterial() {
  const m = new MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: .09 });
  const uniforms = { uVeil: VEIL, uViewport: VIEWPORT, uPitch: { value: SURFACE_PITCH }, uAtom: { value: ATOM_R }, uBond: { value: BOND_R }, uMirror: { value: new Color(.3, .335, .38) } };
  m.customProgramCacheKey = () => 'wafer-surface';
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${PATTERN}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(uMirror, mix(vec3(.012, .014, .017), vec3(.62, .67, .72) * shade, cov), pA);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(.9, .38, cov), pA);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, mix(0.0, .45, cov), pA);')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
// The side of the frame with the heading recedes into the page (as in the lattice).
vec2 frag = gl_FragCoord.xy / uViewport;
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uVeil.w * (1.0 - smoothstep(uVeil.x, uVeil.y, mix(1.0 - frag.y, frag.x, uVeil.z))));`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, normalize((viewMatrix * vec4(nWorld, 0.0)).xyz), pA * cov));');
  };
  return m;
}

export async function createWafer({ renderer, dof }) {
  const scene = new Scene();
  const studio = waferStudio(renderer);
  scene.environment = studio.texture;
  scene.environmentIntensity = 1;
  scene.fog = new Fog(BG, 1, 2);
  // The disc: outline with the notch, extruded to the wafer's thickness, edge rounded; top at SURFACE_Z.
  const shape = new Shape(waferOutline().map(([x, y]) => ({ x, y })));
  const discGeo = new ExtrudeGeometry(shape, { depth: WAFER.thickness - 300e3, bevelEnabled: true, bevelThickness: 150e3, bevelSize: 200e3, bevelSegments: 4, curveSegments: 1 });
  discGeo.computeBoundingBox();
  discGeo.translate(0, 0, SURFACE_Z - discGeo.boundingBox.max.z);
  const discMat = surfaceMaterial(), patchMat = surfaceMaterial();
  const disc = new Mesh(discGeo, discMat);
  // Near the surface a square under the camera carries the surface (its size follows the distance,
  // its edges are beyond the fog); the disc only from far away. Seen from close up, the disc's
  // 150 mm triangles interpolate their positions too coarsely in float for a mirror: some GPUs
  // reflected the wrong direction (a black frame).
  const patch = new Mesh(new PlaneGeometry(1, 1), patchMat);
  // A key for the atoms of the surface (a mirror shows it only as one small glint, off frame).
  const key = new DirectionalLight('#eef2f8', 2.2); key.position.set(-3, -1, 4);
  scene.add(disc, patch, key);
  const camera = new PerspectiveCamera(40, 1, 1, 10);
  camera.up.set(0, 0, 1);
  let size = [1, 1];
  await dof.compile(scene, camera);

  return {
    resize(width, height, framing) { size = [width, height]; if (framing === 'mobile') VEIL.value.set(.3, .55, 0, .8); else VEIL.value.set(.2, .5, 1, .8); },
    /** state: { cam (wafer-math.js), opacity }. Returns the scale bar (true at the focal plane). */
    render({ cam, opacity = 1 }) {
      const near = cam.d < NEAR_D;
      disc.visible = !near; patch.visible = near;
      patch.position.set(cam.target[0], cam.target[1], SURFACE_Z); patch.scale.setScalar(cam.d * 40);
      camera.fov = cam.fov; camera.aspect = size[0] / size[1];
      camera.near = cam.d * .01; camera.far = cam.d * 60;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      scene.fog.near = cam.d * 2.2; scene.fog.far = cam.d * 9;
      renderer.getDrawingBufferSize(VIEWPORT.value);
      renderer.toneMappingExposure = 1;
      dof.render(scene, camera, { focus: cam.d, aperture: cam.aperture, opacity, farMax: 6 });
      return opacity > .6 ? { ...scaleBar(size[1], cam.fov, cam.d), scene: 'lattice' } : null;
    },
    dispose() { studio.dispose(); discGeo.dispose(); patch.geometry.dispose(); discMat.dispose(); patchMat.dispose(); },
  };
}
