import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterAt, heroProgress, positionOf, storyAt, entryPhases, latticeProgress, ENTRY, LATTICE_PIN, clamp, smoothstep } from '../src/scripts/story/timeline.js';
import { FINALE, SCREEN_ASPECT, SCREEN_Z, finaleCamera, finaleState, matchFrame, projectNdc, screenRect, restRect, screenHeroPose } from '../src/scripts/scenes/finale-math.js';
import { WAFER_START, WAFER, WAFER_CENTRE, SURFACE_Z, waferState, waferOutline, latticeEnd } from '../src/scripts/scenes/wafer-math.js';
import heroConfig from '../src/assets/models/hero-camera.json' with { type: 'json' };
import { seeded, A, BOND, diamondCubic, bonds, buildLattice, latticeCamera, latticeFront, scaleBar, CHANNEL_DIR, CHANNEL_POINT, FOCUS, FRONT_NORMAL } from '../src/scripts/scenes/lattice-math.js';
import { cameraPose, heroPose, framingFor, isCompact, END_DISTANCE, PARALLAX_DEG, rotateY } from '../src/scripts/story/camera-rig.js';
import { selectProfile, pixelRatio, textureSet, QualityController } from '../src/scripts/rendering/quality.js';
import { createAssetManager } from '../src/scripts/rendering/assets.js';
import { components, DIM, FRONT_FIN, ANCHORS, LABELS, MOBILE_LABELS, POSTER, coverMap, labelLayout, project, transistorCamera, switchState, finHalfWidth } from '../src/scripts/scenes/transistor-math.js';
import { readFileSync } from 'node:fs';
import { STACK, LEVELS, KEYS, AFTER, route, scaleCamera, growth, transistorRows, DIE as DIE_NM } from '../src/scripts/scenes/scale-math.js';
import { ORDER, ASSEMBLY, LAYERS, placement, activeWord, leibniz, boardLayout, worldCamera } from '../src/scripts/scenes/world-math.js';
import { X as AI_X, W as AI_W, B as AI_B, forward, demoLines, fmt, STAGES, STAGE_AT, stageAt, demoProgress, acceleratorLayout, aiCamera, pulseLanes } from '../src/scripts/scenes/ai-math.js';

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

test('entry phases: copy leaves first, the face dims while the lattice emerges, no cut', () => {
  const at = t => entryPhases(t);
  assert.deepEqual([at(0).camera, at(0).copy, at(0).dark, at(0).lattice, at(0).hero], [0, 1, 0, 0, true]);
  assert.equal(at(ENTRY.face).camera, 1);
  assert.ok(ENTRY.dark < ENTRY.lattice && ENTRY.lattice < ENTRY.black, 'the two images overlap: a dissolve, not a cut');
  assert.equal(at(ENTRY.black).dark, 1, 'the face is fully dimmed before it stops being drawn');
  assert.equal(at(ENTRY.black).hero, false);
  assert.equal(at(1).lattice, 1);
  for (let t = 0; t < 1; t += .001) for (const k of ['dark', 'lattice', 'push'])
    assert.ok(Math.abs(at(t + .001)[k] - at(t)[k]) < .02, `${k} jumps at ${t}`);
});

test('lattice progress is continuous from the hero into the material chapter', () => {
  assert.equal(latticeProgress({ index: 0, hero: ENTRY.lattice }), 0);
  assert.equal(latticeProgress({ index: 0, hero: 1 }), LATTICE_PIN);
  assert.equal(latticeProgress({ index: 1, progress: 0 }), LATTICE_PIN);
  assert.equal(latticeProgress({ index: 1, progress: 1 }), 1);
  assert.equal(latticeProgress({ index: 3, progress: .2 }), 1);
});

test('chapter cross-fade only runs in full motion and not for the hero', () => {
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

// ---- silicon lattice (chapter 01) ------------------------------------------------------------
const distance3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('diamond cubic: 8 atoms per cell, every interior atom has exactly 4 neighbours at a*sqrt(3)/4', () => {
  assert.ok(Math.abs(A - .5431020511) < 1e-12 && Math.abs(BOND - .2351707) < 1e-6);
  const cell = diamondCubic([0, 0, 0], [A * .999, A * .999, A * .999]);
  assert.equal(cell.length, 8);
  const n = 3, quarters = diamondCubic([0, 0, 0], [n * A, n * A, n * A]);
  const points = quarters.map(q => q.map(v => v * A / 4));
  const interior = points.filter(p => p.every(v => v > BOND * 1.01 && v < n * A - BOND * 1.01));
  assert.ok(interior.length > 50);
  for (const p of interior) {
    const near = points.map(o => distance3(p, o)).filter(d => d > 1e-9 && d < BOND * 1.5);
    assert.equal(near.length, 4, `atom ${p} has ${near.length} neighbours`);
    for (const d of near) assert.ok(Math.abs(d - BOND) < 1e-9);
  }
  // Bond list from the quarter-unit steps agrees with the geometry and is tetrahedral (cos = -1/3).
  const list = bonds(quarters), count = new Map();
  for (const [i, j] of list) {
    assert.ok(Math.abs(distance3(points[i], points[j]) - BOND) < 1e-9);
    for (const k of [i, j]) count.set(k, (count.get(k) ?? 0) + 1);
  }
  for (const p of interior) assert.equal(count.get(points.indexOf(p)), 4);
  const centre = points.indexOf(interior[0]);
  const arms = list.filter(b => b.includes(centre)).map(([i, j]) => points[i === centre ? j : i].map((v, k) => v - points[centre][k]));
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++)
    assert.ok(Math.abs(arms[a].reduce((s, v, k) => s + v * arms[b][k], 0) / BOND ** 2 + 1 / 3) < 1e-9);
});

test('lattice build is seeded and deterministic; the final camera looks down an open [110] channel', () => {
  const a = buildLattice({ seed: 14, far: 3 }), b = buildLattice({ seed: 14, far: 3 }), c = buildLattice({ seed: 15, far: 3 });
  assert.equal(a.positions.length, b.positions.length);
  assert.deepEqual(a.grain, b.grain); assert.deepEqual(a.visible, b.visible); assert.deepEqual(a.hashes, b.hashes);
  assert.notDeepEqual(a.grains, c.grains);
  assert.ok(a.visible.some(v => !v) && a.visible.some(v => v), 'grain boundaries hide some atoms in the polycrystal');
  const end = latticeCamera(1);
  assert.ok(near(end.forward, CHANNEL_DIR, 1e-12) && near(end.position, CHANNEL_POINT, 1e-12));
  // Distance from the channel axis to every atom: the six nearest columns sit at 3a/8.
  const axis = p => { const d = p.map((v, i) => v - CHANNEL_POINT[i]); const t = d.reduce((s, v, i) => s + v * CHANNEL_DIR[i], 0); return Math.hypot(...d.map((v, i) => v - t * CHANNEL_DIR[i])); };
  const closest = Math.min(...a.positions.map(axis));
  assert.ok(Math.abs(closest - 3 * A / 8) < 1e-9, `closest column ${closest}`);
  const front = [0, .3, .5, .82, 1].map(u => latticeFront(u).offset);
  assert.ok(front.every((v, i) => !i || v >= front[i - 1]), 'the front only moves forward with u');
  assert.equal(latticeFront(0).heat, 0); assert.ok(latticeFront(1).heat < 1e-6);
  // The hot edge crosses the in-focus plane (the sharp, scale-true part of the frame) at chapter
  // progress .25 (lower half) and .5 (upper half), so it reads in a still.
  for (const [p, lower] of [[.25, true], [.5, false]]) {
    const u = LATTICE_PIN + (1 - LATTICE_PIN) * p, cam = latticeCamera(u), front = latticeFront(u);
    const centre = cam.position.map((v, i) => v + cam.forward[i] * FOCUS);
    const half = FOCUS * Math.tan(cam.fov * Math.PI / 360), at = y => centre.reduce((s, v, i) => s + (v + [0, 0, y][i]) * FRONT_NORMAL[i], 0);
    assert.ok(front.heat > .5, `front hot at ${p}`);
    assert.ok(lower ? front.offset > at(-half) && front.offset < at(0) : front.offset > at(0) && front.offset < at(half), `front edge in frame at ${p}`);
  }
});

test('scale bar is physically true at the focus distance and labelled in Polish', () => {
  const bar = scaleBar(1000, 44, 2);
  const visible = 2 * 2 * Math.tan(22 * Math.PI / 180); // nm spanned by 1000 px at 2 nm
  assert.ok(Math.abs(bar.px - bar.nm * 1000 / visible) < 1e-9);
  assert.equal(scaleBar(1000, 44, 2).label, '0,2 nm');
  assert.equal(scaleBar(4000, 44, 2).label, '0,05 nm');
  assert.equal(scaleBar(400, 60, 2).label, '0,5 nm');
  assert.ok(!/\./.test(scaleBar(400, 60, 2).label));
});

// ---- FinFET (chapter 02) ------------------------------------------------------------------------
test('FinFET model keeps the sourced proportions and cuts through the front fin', () => {
  const fins = components().filter(c => c.fin);
  assert.deepEqual(fins.map(f => f.center[1]), [-DIM.finPitch, 0, DIM.finPitch], 'fin pitch 42 nm');
  for (const f of fins) { assert.equal(f.half[1] * 2, DIM.finWidth); assert.equal(f.center[2] + f.half[2], DIM.finHeight); assert.equal(f.center[2] - f.half[2], 0); }
  const gates = components().filter(c => c.kind === 'gate');
  assert.deepEqual(gates.map(g => g.center[0]), [0], 'one gate, straddling the fins in the middle');
  for (const g of gates) assert.equal(g.half[0] * 2, DIM.gateLength);
  // Source and drain are symmetric about the gate.
  const epi = components().filter(c => c.kind === 'epi').map(c => c.center[0]).sort((a, b) => a - b);
  assert.deepEqual(epi.slice(0, 3).map(x => -x), epi.slice(3));
  assert.equal(FRONT_FIN, -DIM.finPitch);
  // Regression (flickering plates near the oxide): no glass face may touch or cut the isolation top.
  for (const c of components().filter(c => c.ghost)) assert.ok(c.center[2] - c.half[2] >= .4, `${c.kind} glass reaches the oxide`);
  for (const c of components().filter(c => c.root)) assert.ok(c.center[2] + c.half[2] <= -.4, 'fin root shares the oxide top');
  assert.ok(components().every(c => [...c.center, ...c.half].every(Number.isFinite) && c.half.every(v => v > 0)));
});

test('switch sequence: settled states, order of events, interruptions without jumps', () => {
  const on = switchState(true, 1), off = switchState(false, 1);
  assert.deepEqual([on.gate, on.channel, on.stream], [1, [-.5, .5], 1]);
  assert.deepEqual([off.gate, off.stream], [0, 0]); assert.ok(off.channel[1] <= off.channel[0]);
  // ON: the pulse comes first, then the gate, the channel from the source side, the stream last.
  const firstAt = (f) => { for (let i = 0; i <= 100; i++) if (f(switchState(true, i / 100))) return i / 100; return 1; };
  assert.ok(firstAt(s => s.pulse > 0) < firstAt(s => s.gate > .5) && firstAt(s => s.gate > .5) < firstAt(s => s.channel[1] > 0) && firstAt(s => s.channel[1] > 0) < firstAt(s => s.stream > .5));
  for (let i = 0; i <= 100; i++) assert.equal(switchState(true, i / 100).channel[0], -.5, 'the channel grows from the source side');
  // OFF pinches off from the drain side: the drain end recedes, the source end stays.
  assert.ok(switchState(false, .4).channel[1] < .5 && switchState(false, .4).channel[0] === -.5);
  // Each sequence starts at the opposite settled state, so an interrupted one plays backwards cleanly.
  const same = (x, y) => Math.abs(x.gate - y.gate) + Math.abs((x.channel[1] - x.channel[0]) - (y.channel[1] - y.channel[0])) + Math.abs(x.stream - y.stream) < 1e-9;
  assert.ok(same(switchState(true, 0), { gate: 0, channel: [-.5, -.5], stream: 0 }) && same(switchState(false, 0), on));
  for (const target of [true, false]) for (let i = 0; i < 1000; i++) {
    const a = switchState(target, i / 1000), b = switchState(target, (i + 1) / 1000);
    assert.ok(Math.abs(a.gate - b.gate) < .02 && Math.abs(a.stream - b.stream) < .02, `sequence jumps at ${i / 1000}`);
  }
  assert.ok(finHalfWidth(DIM.finHeight / 2) * 2 === DIM.finWidth, 'drawn fin is 8 nm wide at mid-height');
});

test('projection, cover crop and label layout: labels never overlap, static markup matches the poster', () => {
  const cam = transistorCamera(.5, 'desktop');
  assert.ok(near(project(cam.target, cam, 1.6), [(1 + cam.shift[0]) / 2, (1 - cam.shift[1]) / 2], 1e-12), 'target lands on the lens-shifted centre');
  assert.equal(project(cam.position.map((v, i) => v + (v - cam.target[i])), cam, 1.6), null, 'behind the camera');
  assert.ok(near(coverMap([.5, .5], 1.6, 1000, 1000), [.5, .5]) && near(coverMap([0, .5], 1.6, 1600, 1000), [0, .5]));
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  for (const framing of ['desktop', 'mobile']) {
    const [w, h] = POSTER[framing], c = transistorCamera(POSTER.progress, framing);
    const keys = framing === 'mobile' ? MOBILE_LABELS : Object.keys(ANCHORS);
    const anchors = Object.fromEntries(keys.map(k => [k, project(ANCHORS[k], c, w / h).map(v => v * 100)]));
    const layout = labelLayout(anchors, [w, h], framing);
    const rows = Object.values(layout);
    for (const a of rows) for (const b of rows) if (a !== b && a.side === b.side)
      assert.ok(Math.abs(a.y - b.y) / 100 * h >= (framing === 'mobile' ? 19 : 30) - 1e-6, 'labels in one column keep their gap');
    for (const [key, l] of Object.entries(layout)) {
      assert.ok(l.x > 0 && l.x < 100 && l.y > 0 && l.y < 100, `${key} inside the poster`);
      const m = html.match(new RegExp(`data-part="${key}"[^>]*style="([^"]+)"`));
      assert.ok(m, `${key} label in index.html`);
      const v = name => Number(m[1].match(new RegExp(`--${name}:([-\\d.]+)`))[1]);
      const p = framing === 'mobile' ? ['mx', 'my', 'max', 'may'] : ['x', 'y', 'ax', 'ay'];
      assert.ok(near([v(p[0]), v(p[1]), v(p[2]), v(p[3])], [l.x, l.y, l.ax, l.ay], .011), `${framing} ${key} static position = poster layout`);
    }
  }
  assert.deepEqual(Object.keys(LABELS).sort(), Object.keys(ANCHORS).sort());
});

// ---- interconnect stack (chapter 03) ---------------------------------------------------------
const routed = route();

test('routing is seeded, pitches follow the sourced table, segments on a track never overlap', () => {
  assert.deepEqual(JSON.stringify(route().levels.map(l => l.segments.length)), JSON.stringify(routed.levels.map(l => l.segments.length)));
  assert.deepEqual(STACK.slice(0, 7).map(l => l.pitch), [52, 52, 52, 80, 80, 160, 160], 'sourced pitches (Intel 14 nm: 52, 80, 160 nm)');
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].pitch >= LEVELS[i - 1].pitch && LEVELS[i].base > LEVELS[i - 1].top, 'pitch grows upward, levels stacked');
    assert.notEqual(LEVELS[i].dir, LEVELS[i - 1].dir, 'preferred direction alternates');
  }
  for (const level of routed.levels) {
    const along = level.dir === 'x' ? 0 : 1, tracks = new Map();
    for (const sg of level.segments) {
      const centre = (sg.min[1 - along] + sg.max[1 - along]) / 2;
      assert.ok(Math.abs(centre / level.pitch - .5 - Math.round(centre / level.pitch - .5)) < 1e-9, `${level.name} on its track grid`);
      (tracks.get(sg.track) ?? tracks.set(sg.track, []).get(sg.track)).push(sg);
    }
    for (const list of tracks.values()) {
      list.sort((a, b) => a.min[along] - b.min[along]);
      for (let k = 1; k < list.length; k++) assert.ok(list[k].min[along] > list[k - 1].max[along], `${level.name} overlap`);
    }
  }
});

test('vias only where both levels have metal', () => {
  let count = 0;
  for (let i = 1; i < routed.levels.length; i++) {
    const lo = routed.levels[i - 1], hi = routed.levels[i];
    for (const v of hi.vias) {
      const inside = sg => v.min[0] >= sg.min[0] - 1e-6 && v.max[0] <= sg.max[0] + 1e-6 && v.min[1] >= sg.min[1] - 1e-6 && v.max[1] <= sg.max[1] + 1e-6;
      const a = lo.segments.find(inside), b = hi.segments.find(inside);
      assert.ok(a && b, `${hi.name} via without metal`);
      assert.ok(v.after >= a.after && v.after >= b.after, 'a via never appears before the metal it joins');
      assert.equal(v.min[2], lo.top); assert.equal(v.max[2], hi.base);
      count++;
    }
  }
  assert.ok(count > 1000);
  assert.ok(AFTER.margin > 0);
});

test('scale camera: starts on the chapter 02 end frame, continuous, never inside metal', () => {
  const t = transistorCamera(1, 'desktop'), c0 = scaleCamera(0, 'desktop');
  assert.ok(near(c0.position, t.position, 1e-6) && near(c0.target, t.target, 1e-6) && Math.abs(c0.fov - t.fov) < 1e-9);
  for (const framing of ['desktop', 'mobile']) {
    let prev = scaleCamera(0, framing);
    for (let i = 1; i <= 2000; i++) {
      const c = scaleCamera(i / 2000, framing);
      assert.ok(dist(c.position, prev.position) < .06 * Math.min(c.d, prev.d), `camera jumps at ${i / 2000} (${framing})`);
      assert.ok(Math.abs(Math.log(c.d / prev.d)) < .05);
      prev = c;
    }
  }
  for (let i = 0; i <= 400; i++) {
    const c = scaleCamera(i / 400), p = c.position;
    // Metal that exists at this u (deposited with its level, or after the camera has passed).
    for (const level of routed.levels) for (const b of [...level.segments, ...level.vias]) {
      if (b.after > 0 && i / 400 <= b.after) continue;
      const gap = Math.hypot(...p.map((v, k) => Math.max(b.min[k] - v, 0, v - b.max[k])));
      assert.ok(gap > Math.min(.3 * c.d, 1200), `camera inside ${level.name} at u ${i / 400}`);
    }
  }
  assert.deepEqual(KEYS, [0, .16, .3, .6, .8, 1]);
  assert.deepEqual(growth(0).every(g => g === 0), true); assert.deepEqual(growth(.75).every(g => g === 1), true);
  const rows = transistorRows();
  assert.ok(rows.fins.some(f => f.min[1] <= -4 && f.max[1] >= 4) && rows.gates.some(g => g.min[0] < 0 && g.max[0] > 0 && g.min[1] < -42 && g.max[1] > 42), 'the chapter 02 device is one of the rows');
});

test('scale bar labels run from nanometres to millimetres', () => {
  assert.equal(scaleBar(1000, 30, 6000).label, '500 nm');
  assert.equal(scaleBar(1000, 30, 250000).label, '10 µm');
  assert.equal(scaleBar(1000, 30, 3e7).label, '2 mm');
  assert.equal(scaleBar(1000, 32, 5.2e8).label, '2 cm');
});

test('chapter 01 exit: lattice -> cut face -> wafer -> chapter 02, one continuous camera', () => {
  const lookAt = c => c.target ?? c.position.map((v, i) => v + c.forward[i] * FOCUS);
  for (const framing of ['desktop', 'mobile']) {
    // The pull-back starts on the lattice's last frame (no sway) ...
    const glide = latticeCamera(1, framing, 0, 0), start = waferState({ progress: WAFER_START, framing }).cam;
    assert.ok(dist(glide.position, start.position) < 1e-9 && dist(lookAt(glide), start.target) < 1e-9, `${framing}: pull-back starts elsewhere`);
    assert.ok(Math.abs(glide.fov - start.fov) < 1e-9 && near(glide.shift, start.shift, 1e-12));
    // ... the glide reaches that frame exactly at WAFER_START (chapter progress) ...
    assert.equal(latticeProgress({ index: 1, progress: WAFER_START }), 1);
    // ... runs without jumps up to the wafer and down again onto chapter 02's first frame.
    const steps = [];
    const states = [];
    for (let i = 0; i <= 3000; i++) states.push(waferState({ progress: WAFER_START + (1 - WAFER_START) * i / 3000, framing }));
    for (let i = 1; i <= 3000; i++) states.push(waferState({ progress: 1, transition: i / 3000, framing }));
    for (const st of states) steps.push(st.cam);
    for (let i = 1; i < steps.length; i++) {
      const a = steps[i - 1], b = steps[i];
      assert.ok(dist(a.position, b.position) < .08 * Math.min(a.d, b.d) && Math.abs(Math.log(a.d / b.d)) < .06, `${framing}: jump at step ${i}`);
      // Inside the crystal only while the surface is not drawn yet (the camera rises out of the channel).
      if (states[i].wafer > 0) assert.ok(b.position[2] > SURFACE_Z + .05, `${framing}: surface drawn with the camera under it at step ${i}`);
    }
    const t = transistorCamera(0, framing), end = steps.at(-1);
    assert.ok(dist(t.position, end.position) < 1e-6 * Math.hypot(...t.position) && dist(t.target, end.target) < 1e-6 && Math.abs(t.fov - end.fov) < 1e-9, `${framing}: dive does not end on chapter 02`);
    // The scale bar runs from nanometres to centimetres along the way.
    const units = new Set(steps.slice(0, 3001).map(c => scaleBar(framing === 'mobile' ? 844 : 1000, c.fov, c.d).label.split(' ')[1]));
    assert.deepEqual([...units].sort(), ['cm', 'mm', 'nm', 'µm'].sort());
  }
  // The wafer: 300 mm, a notch about 1 mm deep, centred so the atoms we looked at lie on it.
  const r = waferOutline().map(([x, y]) => Math.hypot(x - WAFER_CENTRE[0], y - WAFER_CENTRE[1]));
  assert.ok(Math.abs(Math.max(...r) - 150e6) < 1 && Math.abs(Math.min(...r) - (150e6 - WAFER.notch)) < 2e4);
  assert.ok(Math.hypot(WAFER_CENTRE[0], WAFER_CENTRE[1]) < WAFER.radius - 1e6);
});

// ---- device (chapter 04) ---------------------------------------------------------------------
test('device assembly: order, every part in place at the end, absent at the start', () => {
  assert.deepEqual(ORDER, ['package', 'board', 'parts', 'battery', 'frame', 'display', 'glass']);
  for (const name of Object.keys(ASSEMBLY)) {
    assert.equal(placement(name, 0).appear, 0, `${name} visible at the start`);
    assert.ok(placement(name, 1).k === 1 && placement(name, 1).offset.every(v => v === 0), `${name} not home`);
  }
  assert.deepEqual([0, .3, .5, .8].map(activeWord), [0, 0, 1, 2]);
  assert.ok(Math.abs(leibniz(100000) - Math.PI) < 1e-4);
  const layout = boardLayout();
  assert.deepEqual(JSON.stringify(boardLayout()), JSON.stringify(layout), 'seeded');
  // Nothing on the board overlaps the package footprint around the die.
  const pkg = { x: -LAYERS.board.center[0], y: -LAYERS.board.center[1] };
  for (const p of [...layout.chips, ...layout.passives]) assert.ok(Math.abs(p.x - pkg.x) > 7 + p.w / 2 || Math.abs(p.y - pkg.y) > 7 + p.h / 2);
});

test('hand-over 03 -> 04: the same camera on the die, in nm and in mm; no jumps through chapter 04', () => {
  for (const framing of ['desktop', 'mobile']) {
    const a = scaleCamera(1, framing), b = worldCamera(0, framing);
    const centre = [(DIE_NM.x[0] + DIE_NM.x[1]) / 2, (DIE_NM.y[0] + DIE_NM.y[1]) / 2, 0];
    const rel = a.position.map((v, i) => (v - centre[i]) * 1e-6);
    assert.ok(dist(rel, b.position) < 1e-3 * b.d, `${framing} entry differs`);
    assert.ok(Math.abs(a.fov - b.fov) < 1e-9 && near(a.shift, b.shift, 1e-9));
    let prev = b;
    for (let i = 1; i <= 2000; i++) {
      const c = worldCamera(i / 2000, framing);
      assert.ok(dist(c.position, prev.position) < .06 * Math.min(c.d, prev.d) && Math.abs(Math.log(c.d / prev.d)) < .05, `jump at ${i / 2000}`);
      prev = c;
    }
  }
});

test('AI demo: the layer above the chip shows the true product, the DOM prints the same numbers', () => {
  // y = sigmoid(W x + b), recomputed here by hand.
  const y = AI_W.map((row, i) => 1 / (1 + Math.exp(-(row.reduce((s, w, j) => s + w * AI_X[j], 0) + AI_B[i]))));
  assert.ok(forward().y.every((v, i) => Math.abs(v - y[i]) < 1e-12));
  assert.equal(AI_W.length, AI_X.length); assert.ok(AI_W.every(r => r.length === AI_X.length && r.every(w => Math.abs(w) <= 1)));
  assert.equal(fmt(-.456), '−0.46'); assert.equal(fmt(.4), '\u20070.40');
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const spans = [...html.match(/<div class="computation"[^>]*>(.*?)<\/div>/)[1].matchAll(/<span>(.*?)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(spans, demoLines(), 'static demo text differs from the computed numbers');
  assert.match(html, /DEMONSTRACJA · BEZ POŁĄCZENIA Z MODELEM/);
  // Stages: prompt, numbers, operations, hardware, answer; rows before the pulse, the pulse before the answer.
  assert.deepEqual(STAGES, ['prompt', 'numbers', 'operations', 'hardware', 'answer']);
  assert.deepEqual(STAGE_AT.map(stageAt), [0, 1, 2, 3, 4]);
  assert.deepEqual(STAGE_AT.slice().sort((a, b) => a - b), STAGE_AT);
  const at = t => demoProgress(t);
  assert.ok(at(STAGE_AT[2]).rows === 0 && at(STAGE_AT[3]).rows === AI_W.length && at(STAGE_AT[3]).pulse === 0);
  assert.ok(at(STAGE_AT[4]).pulse === 1 && at(STAGE_AT[4]).answer === 0 && at(99).answer === 1);
  const layout = acceleratorLayout();
  assert.equal(JSON.stringify(acceleratorLayout()), JSON.stringify(layout), 'seeded');
  for (const c of layout.caps) assert.ok(Math.abs(c.x) >= 24 || Math.abs(c.y) >= 22, 'part under the package');
  // Pulse lanes start at the die's edge and end at a memory package or at the edge connector.
  for (const lane of pulseLanes()) {
    const [x0, y0] = lane[0], [x1, y1] = lane.at(-1);
    assert.ok(Math.abs(x0) <= 2 && Math.abs(y0) <= 1.5, 'lane starts off the die');
    assert.ok(layout.memory.some(m => Math.abs(Math.abs(x1) - (Math.abs(m.x) - m.w / 2)) < 1e-9 && Math.abs(y1 - m.y) < m.h / 2) || y1 === -53, 'lane ends nowhere');
  }
});

test('hand-over 04 -> 05: the same die close-up; no jumps through chapter 05', () => {
  for (const framing of ['desktop', 'mobile']) {
    const a = worldCamera(1, framing), b = aiCamera(0, framing);
    assert.ok(dist(a.position, b.position) < 1e-9 && dist(a.target, b.target) < 1e-9 && a.fov === b.fov && near(a.shift, b.shift, 1e-12));
    let prev = b;
    for (let i = 1; i <= 2000; i++) {
      const c = aiCamera(i / 2000, framing);
      assert.ok(dist(c.position, prev.position) < .06 * Math.min(c.d, prev.d) && Math.abs(Math.log(c.d / prev.d)) < .05, `jump at ${i / 2000}`);
      assert.ok(c.position[2] > 3, 'camera below the board');
      prev = c;
    }
  }
});

test('hand-over 05 -> 06: the same frame on the rows of boards; no jumps through chapter 06', () => {
  for (const framing of ['desktop', 'mobile']) {
    const a = aiCamera(1, framing), b = finaleCamera(0, framing);
    assert.ok(dist(a.position, b.position) < 1e-9 && dist(a.target, b.target) < 1e-9 && a.fov === b.fov && near(a.shift, b.shift, 1e-12));
    let prev = b;
    for (let i = 1; i <= 2000; i++) {
      const c = finaleCamera(i / 2000, framing);
      assert.ok(dist(c.position, prev.position) < .06 * Math.min(c.d, prev.d) && Math.abs(Math.log(c.d / prev.d)) < .05, `jump at ${i / 2000}`);
      prev = c;
    }
  }
});

test('finale match: the real chunk lands exactly on the chunk in the screen capture', () => {
  const hero = { ...screenHeroPose(heroConfig), up: [0, 1, 0], shift: [0, 0] };
  const [w, h] = LAYERS.display.size, [cx, cy] = LAYERS.display.center;
  for (const [framing, aspect] of [['desktop', 1440 / 1000], ['mobile', 390 / 844], ['desktop', 1920 / 1080], ['mobile', 360 / 800]]) {
    const cam = finaleCamera(FINALE.match, framing), rect = finaleState(FINALE.match, framing, aspect).chunk;
    assert.ok(near(cam.target, matchFrame(framing).target, 1e-9), 'the match frame is a key');
    for (let i = 0; i < 200; i++) {
      // Points in and around the chunk (glTF metres, longest side 1 m, centred at the origin).
      const r = seeded(i)(), p = [Math.sin(i) * .5 * r, Math.cos(i * 1.7) * .5 * r, Math.sin(i * 2.3) * .5 * r];
      const n = projectNdc(p, hero, SCREEN_ASPECT); // where the capture shows it (its NDC)
      // ...drawn on the display (the texture spans it exactly), seen by the scene camera:
      const onScreen = projectNdc([cx + n[0] * w / 2, cy + n[1] * h / 2, SCREEN_Z], cam, aspect);
      // ...and where the hero scene draws it through the mapped frustum:
      const drawn = [rect.c[0] + n[0] * rect.h[0], rect.c[1] + n[1] * rect.h[1]];
      assert.ok(dist(onScreen, drawn) < 1e-3, `${framing} ${aspect.toFixed(2)}: off by ${dist(onScreen, drawn)}`);
    }
    // The screen is in frame and upright at the match, and the chunk's rectangle never jumps.
    const s = screenRect(cam, aspect);
    assert.ok(s.c.every(v => Math.abs(v) < 1) && s.h[1] > .8);
    for (let u = FINALE.match; u < 1; u += .001) {
      const a = finaleState(u, framing, aspect).chunk, b = finaleState(u + .001, framing, aspect).chunk;
      assert.ok(dist(a.c, b.c) < .02 && dist(a.h, b.h) < .03, `chunk jumps at ${u}`);
    }
    // At rest the chunk sits where the layout expects it, inside the frame.
    const rest = finaleState(1, framing, aspect).chunk, want = restRect(framing, aspect);
    assert.ok(near(rest.c, want.c, 1e-9) && near(rest.h, want.h, 1e-9));
  }
  assert.ok(Math.abs(SCREEN_ASPECT - 390 / 824) < 2e-3, 'the capture viewport has the display aspect');
});

test('the seeded PRNG repeats exactly', () => {
  const a = seeded(14), b = seeded(14);
  assert.deepEqual(Array.from({ length: 20 }, a), Array.from({ length: 20 }, b));
  assert.ok(Array.from({ length: 1000 }, seeded(3)).every(v => v >= 0 && v < 1));
});
