/**
 * Chapter 00: the silicon chunk. Loads the A2 assets (GLB, studio HDR, camera JSON) and poses
 * the camera through the pure camera rig. The key/fill/rim softboxes listed in the JSON are baked
 * into studio-1k.hdr and the Cycles posters are lit by that HDR alone, so the scene uses the
 * environment as its only light (adding them again as punctual lights would double them).
 */
import {
  AgXToneMapping, ACESFilmicToneMapping, NeutralToneMapping, NoToneMapping, DataTexture,
  EquirectangularReflectionMapping, Group, LinearFilter, LinearSRGBColorSpace, PerspectiveCamera, PMREMGenerator,
  Raycaster, RGBAFormat, Scene, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import config from '../../assets/models/hero-camera.json';
import { cameraPose, heroPose, normalize, rotateY } from '../story/camera-rig.js';
import { entryPhases, smoothstep } from '../story/timeline.js';

const URLS = {
  '2k': new URL('../../assets/models/silicon-chunk-2k.glb', import.meta.url).href,
  '1k': new URL('../../assets/models/silicon-chunk-1k.glb', import.meta.url).href,
  env: new URL('../../assets/env/studio-1k.hdr', import.meta.url).href,
  // High-detail patch of the entry face (A2): same object space, denser UVs and its own maps.
  face: new URL('../../assets/models/fracture-face.glb', import.meta.url).href,
};
/** One turn every 90 s on the ambient clock. */
export const TURN_SECONDS = 90;
const TONE = { AgXToneMapping, ACESFilmicToneMapping, NeutralToneMapping, NoToneMapping };

function parseHdr(buffer) {
  const data = new HDRLoader().parse(buffer);
  const texture = new DataTexture(data.data, data.width, data.height, RGBAFormat, data.type);
  Object.assign(texture, { colorSpace: LinearSRGBColorSpace, minFilter: LinearFilter, magFilter: LinearFilter,
    generateMipmaps: false, flipY: true, mapping: EquirectangularReflectionMapping, needsUpdate: true });
  return texture;
}

/** Entry face from the JSON, or the surface point the hero camera looks at (measured on the mesh). */
function entryFace(chunk) {
  const face = config.entryFace;
  const point = face?.center ?? face?.point;
  if (point && face.normal) return { point, normal: normalize(face.normal) };
  const pose = heroPose(config, 'desktop', 1.6);
  const from = rotateY(pose.position, -(config.chunkRotationY ?? 0));
  const ray = new Raycaster(new Vector3(...from), new Vector3(...from).negate().normalize());
  const hit = ray.intersectObject(chunk, true)[0];
  if (!hit) throw new Error('hero: no entry face');
  return { point: hit.point.toArray(), normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray() };
}

export async function createHero({ renderer, assets, textures, anisotropy, signal, invalidate }) {
  const gltfLoader = new GLTFLoader();
  const glbUrl = URLS[textures];
  const [gltf, hdr] = await Promise.all([
    assets.acquire(glbUrl, buffer => gltfLoader.parseAsync(buffer, ''), signal),
    assets.acquire(URLS.env, parseHdr, signal),
  ]);
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdr);
  pmrem.dispose();
  assets.release(URLS.env); // the prefiltered cube map is all the scene needs
  scene.environment = environment.texture;
  scene.environmentIntensity = config.environmentIntensity ?? 1;

  const pivot = new Group();
  const chunk = gltf.scene;
  pivot.add(chunk);
  scene.add(pivot);
  chunk.updateMatrixWorld(true);
  const face = entryFace(chunk);
  face.approach = approachDirection(face.normal);
  setAnisotropy(chunk, anisotropy);

  renderer.toneMapping = TONE[config.toneMapping] ?? NeutralToneMapping;
  renderer.toneMappingExposure = config.exposure ?? 1;

  const rest = config.chunkRotationY ?? 0;
  const lightYaw = config.entryFace?.lightRotationY ?? rest;
  const camera = new PerspectiveCamera(config.fov, 1, .01, 40);
  let hero = heroPose(config, 'desktop', 1.6);
  await renderer.compileAsync(scene, camera);
  signal?.throwIfAborted();

  // The close-up patch is not needed for the first interactive frame (budget), so it loads right
  // after the handover (~20 frames), while the turn is still ramping up from rest and the quality
  // controller is on hold: its one-off texture upload (~120 ms measured) lands where nothing moves
  // yet. Scrolling first starts it earlier. Until it arrives the chunk carries the entry.
  let detail = null, frames = 0;
  function loadDetail() {
    detail = assets.acquire(URLS.face, buffer => gltfLoader.parseAsync(buffer, ''), signal).then(async patch => {
      patch.scene.traverse(node => {
        if (!node.material) return;
        // Coplanar with the chunk's own face: pull it forward in depth instead of z-fighting.
        Object.assign(node.material, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
      });
      setAnisotropy(patch.scene, anisotropy);
      // Upload and compile off the critical frame, so its arrival does not stall the turn.
      patch.scene.traverse(node => { for (const v of Object.values(node.material ?? {})) if (v?.isTexture) renderer.initTexture(v); });
      await renderer.compileAsync(patch.scene, camera, scene);
      signal?.throwIfAborted();
      pivot.add(patch.scene);
      invalidate?.();
      return patch;
    }).catch(error => { if (error?.name !== 'AbortError') console.warn('[krzem.si] entry detail unavailable:', error); });
  }

  return {
    resize(width, height, framing) {
      camera.aspect = width / height;
      hero = heroPose(config, framing, camera.aspect);
      camera.fov = hero.fov;
      camera.updateProjectionMatrix();
    },
    setAnisotropy(value) { setAnisotropy(pivot, value); },
    /** state: { hero: hero progress, time: ambient seconds, parallax: [x, y] } */
    render(state) {
      const theta = rest + state.time * 2 * Math.PI / TURN_SECONDS;
      if (!detail && (state.hero > .02 || ++frames > 20)) loadDetail();
      const s = entryPhases(state.hero).camera;
      const pose = cameraPose({ s, theta, hero, face, parallax: state.parallax });
      pivot.rotation.y = theta;
      // During the final approach the studio turns into the entry face's own light frame
      // (entryFace.lightRotationY), so the close-up is lit the same way whatever the hero pose and
      // whatever angle the ambient turn had reached (the turn is at rest by then).
      scene.environmentRotation.y = wrap(theta - lightYaw) * smoothstep(.35, .85, s);
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      renderer.render(scene, camera);
    },
    dispose() {
      environment.dispose();
      assets.release(glbUrl);
      if (detail) assets.release(URLS.face);
    },
    face,
  };
}

const wrap = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * End the approach slightly oblique: halfway between the face normal and the mirror direction
 * of the key softbox (in the entry face's light frame), so the fracture face carries a soft specular
 * gradient instead of reflecting the dark studio behind the camera.
 */
function approachDirection(normal) {
  const key = (config.lights ?? []).find(l => l.name === 'key') ?? (config.lights ?? []).find(l => l.type === 'key');
  if (!key) return normal;
  const yaw = config.entryFace?.lightRotationY ?? config.chunkRotationY ?? 0;
  const n = normalize(normal), l = normalize(rotateY(key.position, -yaw));
  const d = n[0] * l[0] + n[1] * l[1] + n[2] * l[2];
  if (d <= .05) return normal;
  const mirror = n.map((v, i) => 2 * d * v - l[i]);
  return normalize(n.map((v, i) => v + (mirror[i] - v) * .45));
}

function setAnisotropy(root, value) {
  root.traverse(node => {
    for (const material of [node.material].flat().filter(Boolean))
      for (const key of Object.keys(material)) if (material[key]?.isTexture) { material[key].anisotropy = value; material[key].needsUpdate = true; }
  });
}
