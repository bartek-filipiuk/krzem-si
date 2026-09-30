import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterAt, heroProgress, positionOf, storyAt, entryPhases, ENTRY, clamp, smoothstep } from '../src/scripts/story/timeline.js';
import { cameraPose, heroPose, framingFor, isCompact, END_DISTANCE, PARALLAX_DEG, rotateY } from '../src/scripts/story/camera-rig.js';
import { selectProfile, pixelRatio, textureSet, QualityController } from '../src/scripts/rendering/quality.js';
import { createAssetManager } from '../src/scripts/rendering/assets.js';
import { identity, multiply, model, lookAt, perspective, seeded } from '../src/scripts/scenes/legacy-math.js';
import { crystal, cylinder, circuit, transistor, bevelBox } from '../src/scripts/scenes/legacy-geometry.js';

const near = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const angle = (a, b) => Math.acos(clamp(a.reduce((s, v, i) => s + v * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b)), -1, 1));

// Shape of hero-camera.json (A2 contract) with the numbers of the desktop framing.
const config = {
  fov: 42, position: [-.42, .16, 1.8], target: [-.42, -.02, 0],
  desktop: { fov: 42, aspect: 1.6, position: [-.42, .16, 1.8], target: [-.42, -.02, 0] },
  mobile: { fov: 50, aspect: 900 / 1400, position: [0, .36, 2.05], target: [0, .3, 0] },
};
const face = { point: [.2, .1, .3], normal: [.45, .2, .87] };
const hero = heroPose(config, 'desktop', 1.6);

// ---- scroll -> chapter / story -------------------------------------------------------------
const bounds = [{ top: 0, height: 1550 }, { top: 1550, height: 1750 }, { top: 3300, height: 1750 }];

test('chapter progress handles boundaries and short chapters', () => {
  const b = [{ top: 0, height: 1600 }, { top: 1600, height: 1600 }];
  assert.deepEqual(chapterAt(400, b, 800), { index: 0, progress: .5 });
  assert.deepEqual(chapterAt(1600, b, 800), { index: 1, progress: 0 });
  assert.equal(chapterAt(0, [{ top: 0, height: 800 }], 800).progress, 0);
});

test('hero progress spans hero top to the pinned material chapter', () => {
  assert.equal(heroProgress(0, bounds), 0);
  assert.equal(heroProgress(775, bounds), .5);
  assert.equal(heroProgress(1550, bounds), 1);
  assert.equal(heroProgress(9999, bounds), 1);
});

test('QA positions map back to the same chapter and progress', () => {
  for (const [index, p] of [[0, 0], [0, .25], [0, .75], [1, .5], [2, .9]]) {
    const y = positionOf(index, p, bounds, 1000), s = storyAt(y, 1000, bounds);
    if (index === 0) assert.ok(Math.abs(s.hero - p) < 1e-9);
    else { assert.equal(s.index, index); assert.ok(Math.abs(s.progress - p) < 1e-9); }
  }
  assert.equal(storyAt(positionOf(0, 1, bounds, 1000), 1000, bounds).index, 1, 'hero progress 1 = material pinned');
});

test('entry phases: copy leaves first, camera arrives, canvas dips to the background at the cut only', () => {
  const at = t => entryPhases(t);
  assert.deepEqual([at(0).camera, at(0).copy, at(0).canvas, at(0).scene], [0, 1, 1, 'hero']);
  assert.equal(at(ENTRY.face).camera, 1);
  assert.equal(at(ENTRY.cut - 1e-9).canvas < 1e-6, true);
  assert.equal(at(ENTRY.cut).scene, 'material');
  assert.equal(at(ENTRY.cut).canvas, 0, 'the cut happens while nothing is visible');
  assert.equal(at(1).canvas, 1);
  for (let t = 0; t < 1; t += .001) assert.ok(Math.abs(at(t + .001).canvas - at(t).canvas) < .02, `canvas jumps at ${t}`);
});

test('legacy cross-fade only runs in full motion and not for the hero', () => {
  const y = 1550 + 1750 - 500;
  assert.ok(storyAt(y, 1000, bounds).transition > 0);
  assert.equal(storyAt(y, 1000, bounds, { motion: false }).transition, 0);
  assert.equal(storyAt(1200, 1000, bounds).transition, 0);
});

// ---- camera rig ----------------------------------------------------------------------------
test('camera at s=0 is exactly the Blender hero camera, whatever the chunk rotation', () => {
  for (const theta of [0, .6, 2, Math.PI, 5.5]) {
    const pose = cameraPose({ s: 0, theta, hero, face });
    assert.ok(near(pose.position, hero.position, 1e-12) && near(pose.target, hero.target, 1e-12));
  }
});

test('camera pose is a pure function: forward, backward and fresh evaluations agree', () => {
  const eval_ = (s, theta) => cameraPose({ s, theta, hero, face, parallax: [.2, -.1] });
  const steps = Array.from({ length: 101 }, (_, i) => i / 100);
  const forward = steps.map(s => eval_(s, 1.3));
  const backward = [...steps].reverse().map(s => eval_(s, 1.3)).reverse();
  assert.deepEqual(forward, backward);
  assert.deepEqual(eval_(.37, 1.3), eval_(.37, 1.3));
});

test('camera ends on the face normal at END_DISTANCE and looks into the face', () => {
  for (const theta of [0, 1, 3]) {
    const pose = cameraPose({ s: 1, theta, hero, face });
    const point = rotateY(face.point, theta);
    assert.ok(Math.abs(dist(pose.position, point) - END_DISTANCE) < 1e-9);
    assert.ok(near(pose.target, point, 1e-9));
  }
});

test('camera path is continuous and stays outside the chunk, also when the face points away', () => {
  for (let k = 0; k < 24; k++) {
    const theta = k / 24 * 2 * Math.PI;
    let prev = cameraPose({ s: 0, theta, hero, face }).position;
    for (let i = 1; i <= 1000; i++) {
      const s = i / 1000, p = cameraPose({ s, theta, hero, face }).position;
      assert.ok(dist(p, prev) < .025, `jump at theta ${theta.toFixed(2)}, s ${s}`);
      // Chunk: longest side 1 m, so a 0.55 m sphere contains it. Only the final approach may enter it.
      if (s < .75) assert.ok(Math.hypot(...p) > .55, `inside chunk at theta ${theta.toFixed(2)}, s ${s}`);
      prev = p;
    }
  }
  // Small changes of the ambient rotation move the camera a little, never flip it (no wrap-around).
  for (const s of [.2, .4, .6]) for (let k = 0; k < 360; k++) {
    const a = cameraPose({ s, theta: k * Math.PI / 180, hero, face }).position, b = cameraPose({ s, theta: (k + .5) * Math.PI / 180, hero, face }).position;
    assert.ok(dist(a, b) < .05, `rotation jump at ${k} deg, s ${s}`);
  }
});

test('pointer parallax is capped at 2 degrees and fades out during the entry', () => {
  const base = cameraPose({ s: 0, theta: 0, hero, face });
  const offset = p => p.position.map((v, i) => v - p.target[i]);
  for (const parallax of [[.5, 0], [-.5, 0], [0, .5], [.5, .5], [3, -3]]) {
    const p = cameraPose({ s: 0, theta: 0, hero, face, parallax });
    assert.ok(angle(offset(p), offset(base)) <= PARALLAX_DEG * Math.PI / 180 * 1.26 + 1e-9);
  }
  assert.deepEqual(cameraPose({ s: .5, theta: 0, hero, face, parallax: [.5, .5] }), cameraPose({ s: .5, theta: 0, hero, face }));
});

test('hero framing: cover-crop FOV, width rule shared with the poster, compact is layout only', () => {
  assert.equal(heroPose(config, 'desktop', 1.44).fov, 42, 'narrower than poster: same vertical FOV');
  const wide = heroPose(config, 'desktop', 2.4).fov;
  assert.ok(Math.abs(Math.tan(wide * Math.PI / 360) * 2.4 - Math.tan(42 * Math.PI / 360) * 1.6) < 1e-12, 'wider: same horizontal extent');
  assert.equal(framingFor(759), 'mobile'); assert.equal(framingFor(760), 'desktop');
  assert.equal(isCompact(320, 640), true); assert.equal(isCompact(390, 844), false); assert.equal(isCompact(844, 390), true);
  assert.deepEqual(heroPose(config, 'mobile', .5).position, config.mobile.position);
});

// ---- profiles and quality controller -------------------------------------------------------
test('profile selection order: QA > user choice > reduced motion / Save-Data > default', () => {
  assert.equal(selectProfile().profile, 'cinematic');
  assert.equal(selectProfile({ reduced: true }).profile, 'calm');
  assert.equal(selectProfile({ saveData: true }).profile, 'calm');
  assert.equal(selectProfile({ reduced: true, choice: 'motion' }).profile, 'cinematic');
  assert.equal(selectProfile({ choice: 'calm' }).profile, 'calm');
  assert.equal(selectProfile({ choice: 'calm', qa: 'balanced' }).profile, 'balanced');
  assert.equal(selectProfile({ qa: 'nonsense' }).profile, 'cinematic');
  assert.equal(selectProfile({ saveData: true }).reason, 'save-data');
});

test('DPR caps 1.5 / 1.0 plus a pixel budget; 1K textures on phone framing', () => {
  assert.equal(pixelRatio('cinematic', 3, 390, 844), 1.5);
  assert.equal(pixelRatio('balanced', 3, 390, 844), 1);
  assert.ok(pixelRatio('cinematic', 2, 3840, 2160) ** 2 * 3840 * 2160 <= 3.4e6 + 1);
  assert.equal(textureSet('cinematic', 'desktop'), '2k');
  assert.equal(textureSet('cinematic', 'mobile'), '1k');
  assert.equal(textureSet('balanced', 'desktop'), '1k');
});

function feed(controller, profile, ms, frames, start = 0) {
  let now = start;
  for (let i = 0; i < frames; i++) { now += ms; profile = controller.sample(ms, now, profile); }
  return [profile, now];
}

test('controller demotes only after two consecutive slow windows (hysteresis)', () => {
  const c = new QualityController();
  let [p, now] = feed(c, 'cinematic', 30, 60);           // one slow window
  assert.equal(p, 'cinematic');
  [p, now] = feed(c, p, 16, 60, now);                      // good window resets the count
  [p, now] = feed(c, p, 30, 60, now);
  assert.equal(p, 'cinematic');
  [p, now] = feed(c, p, 30, 60, now);                      // second consecutive slow window
  assert.equal(p, 'balanced');
  [p, now] = feed(c, p, 50, 120, now);
  assert.equal(p, 'calm');
});

test('controller judges p95 as well as median, and never promotes', () => {
  const c = new QualityController();
  let p = 'cinematic', now = 0;
  for (let w = 0; w < 2; w++) for (let i = 0; i < 60; i++) { const ms = i % 10 === 0 ? 60 : 16; now += ms; p = c.sample(ms, now, p); }
  assert.equal(p, 'balanced', 'stutter every 10th frame fails p95 with a fine median');
  [p] = feed(c, p, 8, 600, now);
  assert.equal(p, 'balanced');
});

test('controller ignores holds (shader compile, tab return) and paused-loop gaps', () => {
  const c = new QualityController();
  c.hold(0, 1000);
  let [p, now] = feed(c, 'cinematic', 100, 9);             // 900 ms of terrible frames while held
  assert.equal(p, 'cinematic');
  assert.equal(c.window.length, 0);
  for (let i = 0; i < 200; i++) { now += 400; p = c.sample(400, now, p); }   // > 250 ms: loop was paused
  assert.equal(p, 'cinematic');
  c.hold(now, 1000);
  [p] = feed(c, p, 20, 40, now);                           // under the limits after the hold
  assert.equal(p, 'cinematic');
});

test('slow devices demote within seconds, not minutes', () => {
  const [p, now] = feed(new QualityController(), 'cinematic', 200, 20);
  assert.equal(p, 'balanced');
  assert.ok(now <= 4000);
});

// ---- asset manager -------------------------------------------------------------------------
test('asset manager shares one fetch, disposes on last release, cancels on abort', async t => {
  const calls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = (url, { signal }) => { calls.push(url); return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }), 10);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); });
  }); };
  const assets = createAssetManager();
  let disposed = 0;
  const parse = () => ({ dispose: () => disposed++ });
  const [a, b] = await Promise.all([assets.acquire('/a', parse), assets.acquire('/a', parse)]);
  assert.equal(a, b); assert.equal(calls.length, 1);
  assets.release('/a'); assert.equal(disposed, 0);
  assets.release('/a'); assert.equal(disposed, 1); assert.equal(assets.size, 0);

  const controller = new AbortController();
  const pending = assets.acquire('/b', parse, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(assets.size, 0);
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  await assert.rejects(assets.acquire('/missing.glb', parse), /404/);
  assert.equal(assets.size, 0, 'a failed load can be retried');
});

// ---- legacy chapters 1-6 (v0.1 renderer, kept until stages B/C) ------------------------------
test('legacy matrices are column-major', () => {
  const m = model(2, 3, 4, .1, .2, .3, 2); assert.deepEqual(multiply(identity(), m), m);
  assert.deepEqual([...multiply(model(1, 2, 3), model(2, 3, 4))].slice(12, 15), [3, 5, 7]);
  assert.equal(lookAt([0, 0, 8])[14], -8); assert.ok(perspective(Math.PI / 3, 1.7).every(Number.isFinite));
  assert.equal(smoothstep(0, 1, .5), .5);
});
test('legacy geometry is seeded, finite and has unit normals', () => {
  const a = seeded(14), b = seeded(14);
  assert.deepEqual(Array.from({ length: 20 }, a), Array.from({ length: 20 }, b));
  assert.deepEqual(crystal(), crystal());
  const out = []; bevelBox(out, 0, 0, 0, 2, 1, 1);
  for (const data of [crystal(), cylinder(), ...Object.values(circuit(12)), ...Object.values(transistor()), new Float32Array(out)]) {
    assert.equal(data.length % 27, 0); assert.ok(data.every(Number.isFinite));
    for (let i = 0; i < data.length; i += 9) assert.ok(Math.abs(Math.hypot(data[i + 3], data[i + 4], data[i + 5]) - 1) < 1e-5);
  }
});
