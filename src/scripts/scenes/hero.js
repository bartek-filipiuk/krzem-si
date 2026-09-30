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
import { entryPhases } from '../story/timeline.js';

const URLS = {
  '2k': new URL('../../assets/models/silicon-chunk-2k.glb', import.meta.url).href,
  '1k': new URL('../../assets/models/silicon-chunk-1k.glb', import.meta.url).href,
  env: new URL('../../assets/env/studio-1k.hdr', import.meta.url).href,
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

export async function createHero({ renderer, assets, textures, anisotropy, signal }) {
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
  setAnisotropy(chunk, anisotropy);

  renderer.toneMapping = TONE[config.toneMapping] ?? NeutralToneMapping;
  renderer.toneMappingExposure = config.exposure ?? 1;

  const camera = new PerspectiveCamera(config.fov, 1, .01, 40);
  let hero = heroPose(config, 'desktop', 1.6);
  await renderer.compileAsync(scene, camera);
  signal?.throwIfAborted();

  return {
    resize(width, height, framing) {
      camera.aspect = width / height;
      hero = heroPose(config, framing, camera.aspect);
      camera.fov = hero.fov;
      camera.updateProjectionMatrix();
    },
    setAnisotropy(value) { setAnisotropy(chunk, value); },
    /** state: { hero: hero progress, time: ambient seconds, parallax: [x, y] } */
    render(state) {
      const theta = (config.chunkRotationY ?? 0) + state.time * 2 * Math.PI / TURN_SECONDS;
      const pose = cameraPose({ s: entryPhases(state.hero).camera, theta, hero, face, parallax: state.parallax });
      pivot.rotation.y = theta;
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      renderer.render(scene, camera);
    },
    dispose() {
      environment.dispose();
      assets.release(glbUrl);
    },
    face,
  };
}

function setAnisotropy(root, value) {
  root.traverse(node => {
    for (const material of [node.material].flat().filter(Boolean))
      for (const key of Object.keys(material)) if (material[key]?.isTexture) { material[key].anisotropy = value; material[key].needsUpdate = true; }
  });
}
