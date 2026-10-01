/**
 * Text layer: chapter tracking, navigation state, reading progress, the motion toggle, the
 * transistor and AI demos, profile selection and the single requestAnimationFrame loop.
 * Everything here works without the GPU layer, which is imported lazily and never in `calm`.
 */
import { clamp, createScrollReader, entryPhases, smoothstep } from './story/timeline.js';
import { framingFor, isCompact } from './story/camera-rig.js';
import { QualityController, selectProfile } from './rendering/quality.js';
import { activeWord } from './scenes/world-math.js';
import { stageAt } from './scenes/ai-math.js';
import { ANCHORS, MOBILE_LABELS, POSTER, SWITCH_MS, labelLayout, project, transistorCamera } from './scenes/transistor-math.js';

const root = document.documentElement;
const canvas = document.querySelector('#scene-canvas');
const sections = [...document.querySelectorAll('[data-scene]')];
const links = [...document.querySelectorAll('.chapter-nav a')];
const status = document.querySelector('#render-status');
const motionButton = document.querySelector('#motion-toggle');
const motionLabel = document.querySelector('#motion-label');
const powerButton = document.querySelector('#transistor-toggle');
const aiButton = document.querySelector('#ai-toggle');
const aiPanel = document.querySelector('#ai-demo');
const progressBar = document.querySelector('#reading-progress-bar');
const wordItems = [...document.querySelectorAll('#world-title [data-word]')];
const partLabels = document.querySelector('.part-labels');
const labelItems = [...partLabels.querySelectorAll('[data-part]')];
const scaleBoxes = { lattice: document.querySelector('#lattice-scale'), transistor: document.querySelector('#transistor-scale'), scale: document.querySelector('#scale-scale'), world: document.querySelector('#world-scale'), ai: document.querySelector('#ai-scale') };
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const reader = createScrollReader(sections, document.querySelector('#zrodla'));
const controller = new QualityController();

// QA mode: ?scene=<id>&progress=<0..1>&quality=<profile>&freeze=1&seed=<n> (see README).
const params = new URLSearchParams(location.search);
const qaIndex = sections.findIndex(s => s.id === params.get('scene'));
const qa = {
  index: qaIndex,
  progress: clamp(Number(params.get('progress')) || 0),
  quality: params.get('quality'),
  freeze: params.get('freeze') === '1',
  // Seeded ambient phase in seconds; 0 (the default) is the poster's pose.
  phase: ((Math.imul(Number(params.get('seed')) >>> 0, 2654435761) >>> 0) / 2 ** 32) * 90,
  // Chapter 02 state forced like a click on the switch: power=on | power=off.
  power: params.has('power') ? params.get('power') === 'on' : null,
};
const debug = params.has('debug') || qaIndex >= 0 || params.has('quality');

let choice = null;
try {
  const stored = localStorage.getItem('krzem-motion');
  choice = stored === 'static' || stored === 'calm' ? 'calm' : stored === 'motion' ? 'motion' : null;
} catch { /* Storage blocked: the page still works, the choice just is not remembered. */ }

let layer = null, profile = 'calm', reason = '', framing = framingFor(innerWidth);
let raf = 0, dirty = true, destroyed = false, generation = 0, abort = null;
let story = null, previousIndex = -1, lastFrame = 0, liveAt = 0, ambient = qa.phase;
let pointer = [0, 0], parallax = [0, 0], manualPower = qa.power, lastPower = null, manualAI = null;
// The switch sequence (towards seqOn), at progress seqFrom when it (re)started at switchAt, running
// forwards (dir 1) or, when interrupted, backwards to where it began (dir -1): no jumps.
let switchAt = -Infinity, switchFrom = 1, seqOn = false, seqDir = 1;
const intervals = [], logged = new Set();

function warnOnce(kind, error) {
  if (logged.has(kind)) return;
  logged.add(kind);
  console.warn(`[krzem.si] ${kind}:`, error);
}
function persist(value) { try { localStorage.setItem('krzem-motion', value); } catch { /* see above */ } }
function motionFull() { return root.dataset.motion === 'full'; }

function measure() {
  reader.measure();
  copyCache = null;
  layer?.resize(innerWidth, innerHeight, { framing });
  dirty = true; schedule();
}

function switchProgress(now) { return clamp(switchFrom + seqDir * (now - switchAt) / SWITCH_MS); }
/** What the scene shows: { on, s } of the running sequence; a frozen QA frame shows the settled state. */
function switchView(now) { return qa.freeze ? { on: !!lastPower, s: 1 } : { on: seqOn, s: switchProgress(now) }; }
/** The AI demo: opening it starts its stages (prompt, numbers, operations, hardware, answer). */
let aiAt = -Infinity;
function setAI(open) {
  if (aiPanel.classList.contains('is-open') === open) return;
  aiPanel.classList.toggle('is-open', open); aiButton.setAttribute('aria-expanded', String(open));
  aiAt = performance.now();
}
/** Seconds since the demo opened (a frozen QA frame and calm mode show the finished demo). */
function aiTime(now) { return qa.freeze || !motionFull() ? 99 : (now - aiAt) / 1000; }
function aiView(now) {
  const open = aiPanel.classList.contains('is-open'), t = aiTime(now), stage = String(open ? stageAt(t) : 4);
  if (aiPanel.dataset.stage !== stage) aiPanel.dataset.stage = stage;
  return { open, t };
}

function setPower(power) {
  if (lastPower === power) return;
  const now = performance.now();
  if (lastPower === null) { seqOn = power; switchFrom = 1; seqDir = 1; }
  else {
    const s = switchProgress(now);
    const settled = seqDir > 0 ? s >= 1 : s <= 0;
    if (settled) { seqOn = power; switchFrom = 0; seqDir = 1; }
    else { switchFrom = s; seqDir = power === seqOn ? 1 : -1; }
    switchAt = now;
  }
  lastPower = power;
  powerButton.setAttribute('aria-pressed', String(power)); root.dataset.power = power ? 'on' : 'off';
  document.querySelector('#switch-label').textContent = power ? 'Wyłącz przewodzenie' : 'Włącz przewodzenie';
  powerButton.querySelector('.switch-state').textContent = power ? '1' : '0';
  document.querySelector('#switch-description').textContent = power ? 'Kanał przewodzi. Napięcie bramki zmieniło jego stan.' : 'Kanał nie przewodzi w tym uproszczonym modelu.';
}

function update() {
  if (!reader.bounds.length) return;
  story = reader.read(window.scrollY, innerHeight, motionFull());
  const { index, progress } = story;
  if (index !== previousIndex) {
    links.forEach((a, i) => { if (i === index) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
    root.dataset.chapter = String(index); previousIndex = index; copyCache = null;
    controller.hold(performance.now(), 500); // first frames of a chapter upload its meshes
  }
  progressBar.style.transform = `scaleX(${story.reading})`;
  if (index === 1) { const step = Math.min(3, Math.floor(progress * 4)); document.querySelectorAll('[data-process]').forEach((li, i) => li.dataset.active = String(i <= step)); }
  if (index === 2) setPower(manualPower ?? (progress > .35));
  if (index === 4) { const w = activeWord(progress); wordItems.forEach((el, i) => el.classList.toggle('is-active', i === w)); }
  if (index === 5) setAI(manualAI ?? (progress > .23 && progress < .66));
  if (motionFull()) {
    root.style.setProperty('--hero-copy', entryPhases(story.hero).copy.toFixed(3));
    // Chapter 03's heading lands only after the perspective shift (the reveal frame).
    root.style.setProperty('--scale-copy', (index < 3 ? 0 : index > 3 ? 1 : smoothstep(.52, .6, progress)).toFixed(3));
  }
  dirty = false;
}

function schedule() { if (!raf && !destroyed && !document.hidden) raf = requestAnimationFrame(tick); }

function tick(now) {
  raf = 0;
  if (destroyed || document.hidden) return;
  const wasDirty = dirty;
  if (dirty) update();
  if (!layer || !story?.visible) { lastFrame = 0; return; }
  const dt = lastFrame ? now - lastFrame : 0;
  lastFrame = now;
  if (liveAt && !qa.freeze) {
    // The chunk starts from the poster's pose and eases into its 90 s turn after the handover,
    // and comes to rest while the camera commits to the entry face (the ambient clock may
    // depend on the story; the camera pose itself stays a pure function of scroll and angle).
    const entering = story.index === 0 ? smoothstep(0, .3, entryPhases(story.hero).camera) : 0;
    ambient += Math.min(dt, 64) / 1000 * Math.min(1, (now - liveAt) / 2000) * (1 - entering);
    const k = 1 - Math.exp(-Math.min(dt, 64) / 400);
    parallax = parallax.map((v, i) => v + (pointer[i] - v) * k);
  }
  let cpu = 0;
  try {
    // The switch plays its sequence in real time; a frozen QA frame shows the settled state.
    cpu = layer.frame({ ...story, time: ambient, parallax, power: switchView(now), ai: aiView(now) });
  } catch (error) { fail('Render error', error, 'TRYB LEKKI · 3D NIEDOSTĘPNE'); return; }
  showScale(layer.scale);
  placeLabels();
  if (!liveAt) {
    liveAt = now;
    root.dataset.renderer = 'webgl'; root.dataset.hero = 'live';
    controller.hold(now, 1000);
  } else if (dt) {
    if (debug) { intervals.push([dt, cpu]); if (intervals.length > 3000) intervals.shift(); }
    if (!qa.freeze && reason !== 'qa') demote(controller.sample(dt, now, profile));
  }
  // Ambient motion needs every frame; a frozen QA frame only redraws on scroll or resize.
  if (!qa.freeze || wasDirty) schedule();
}

/**
 * Chapter 02 part labels follow the live camera (same pure camera as scenes/transistor.js), laid
 * out in the poster's cover box; outside the pinned chapter they are hidden (the stage scrolls,
 * the canvas does not).
 */
function placeLabels() {
  const live = story.index === 2 && story.transition === 0;
  partLabels.toggleAttribute('data-live', live);
  if (!live) return;
  const W = innerWidth, H = innerHeight, [pw, ph] = POSTER[framing], A = pw / ph;
  const box = [Math.max(W, H * A), Math.max(H, W / A)];
  const cam = transistorCamera(story.progress, framing, ambient * 2 * Math.PI / 80);
  const anchors = {};
  for (const [key, point] of Object.entries(ANCHORS)) {
    if (framing === 'mobile' && !MOBILE_LABELS.includes(key)) continue;
    // A part out of the frame (the camera moves in close mid-chapter) loses its label.
    const fp = project(point, cam, W / H);
    const li = labelItems.find(l => l.dataset.part === key), e = li?.hidden ? .03 : 0; // hysteresis
    if (!fp || fp[0] < .03 + e || fp[0] > .97 - e || fp[1] < .1 + e || fp[1] > .9 - e) continue;
    const [fx, fy] = fp;
    anchors[key] = [(fx * W + (box[0] - W) / 2) / box[0] * 100, (fy * H + (box[1] - H) / 2) / box[1] * 100];
  }
  const layout = labelLayout(anchors, box, framing);
  for (const li of labelItems) {
    const l = layout[li.dataset.part];
    li.dataset.wasHidden = String(li.hidden);
    li.hidden = !l;
    if (!l) continue;
    li.style.setProperty('--px', l.x.toFixed(2)); li.style.setProperty('--py', l.y.toFixed(2));
    li.style.setProperty('--pax', l.ax.toFixed(2)); li.style.setProperty('--pay', l.ay.toFixed(2));
    li.dataset.side = l.side; li.dataset.sideMobile = l.side;
  }
  // A label that would land on the chapter copy (the camera's close view) is hidden instead.
  const copy = copyRects();
  for (const li of labelItems) {
    if (li.hidden) continue;
    const r = li.querySelector('span').getBoundingClientRect();
    // Hysteresis: a hidden label comes back only with a clear margin, so the camera's sway cannot
    // make it blink on and off at the threshold.
    const m = li.dataset.wasHidden === 'true' ? 24 : 8;
    li.hidden = copy.some(c => r.left < c.right + m && c.left < r.right + m && r.top < c.bottom + m / 2 && c.top < r.bottom + m / 2)
      || r.left < m / 2 || r.right > W - m / 2;
  }
}

/** Ink boxes of chapter 02's copy (text ranges, the button as a box), cached until the next measure. */
let copyCache = null;
function copyRects() {
  if (copyCache) return copyCache;
  const range = document.createRange();
  copyCache = [...document.querySelectorAll('#tranzystor .chapter-copy > *, #tranzystor .lattice-legend > *')].map(e => {
    if (e.tagName === 'BUTTON') return e.getBoundingClientRect();
    range.selectNodeContents(e); return range.getBoundingClientRect();
  }).filter(r => r.width > 0);
  return copyCache;
}

/** Scale bar under the lattice: only drawn from a live camera, so it never shows a stale value. */
let shownScale = '';
function showScale(scale) {
  const key = scale ? `${scale.scene}/${scale.label}/${scale.px.toFixed(1)}` : '';
  if (key === shownScale) return;
  shownScale = key;
  for (const [scene, box] of Object.entries(scaleBoxes)) {
    box.hidden = scene !== scale?.scene;
    if (box.hidden) continue;
    box.querySelector('i').style.width = `${scale.px.toFixed(1)}px`;
    box.querySelector('span').textContent = scale.label;
  }
}

function demote(next) {
  if (!layer || next === profile) return;
  if (next === 'calm') { stop('TRYB SPOKOJNY · DLA PŁYNNOŚCI'); return; }
  profile = next; root.dataset.quality = profile;
  layer.resize(innerWidth, innerHeight, { profile });
  status.textContent = 'TRYB OSZCZĘDNY · ANIMACJE 3D';
}

/** Switch between the pinned (full) and flowing (static) layouts without losing the reader's place. */
function relayout(mode) {
  if (root.dataset.motion === mode) return;
  reader.measure();
  const at = reader.bounds.length ? reader.read(window.scrollY, innerHeight, false).index : 0;
  root.dataset.motion = mode;
  reader.measure();
  if (at > 0) window.scrollTo(0, reader.bounds[at].top);
}

function stop(message = 'TRYB SPOKOJNY · PEŁNA OPOWIEŚĆ') {
  generation++; abort?.abort(); abort = null;
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  layer?.dispose(); layer = null; liveAt = 0; lastFrame = 0; profile = 'calm';
  root.dataset.renderer = 'static'; root.dataset.quality = 'calm'; delete root.dataset.hero;
  root.style.removeProperty('--hero-copy'); root.style.removeProperty('--scale-copy'); showScale(null); partLabels.removeAttribute('data-live');
  for (const li of labelItems) for (const v of ['--px', '--py', '--pax', '--pay']) li.style.removeProperty(v);
  status.textContent = message; motionLabel.textContent = 'Włącz animacje'; motionButton.setAttribute('aria-pressed', 'true');
  relayout('static');
  measure();
}

function fail(kind, error, message) { warnOnce(kind, error); stop(message); }

async function start(next) {
  const token = ++generation;
  abort?.abort(); abort = new AbortController();
  profile = next;
  root.dataset.quality = profile; root.dataset.framing = framing;
  motionLabel.textContent = 'Ogranicz animacje'; motionButton.setAttribute('aria-pressed', 'false');
  status.textContent = profile === 'cinematic' ? 'INTERAKTYWNA OPOWIEŚĆ · 3D' : 'TRYB OSZCZĘDNY · ANIMACJE 3D';
  relayout('full');
  measure();
  try {
    // The text layer and the posters have painted already. GPU code is a separate chunk.
    const { createGpuLayer } = await import('./rendering/renderer.js');
    if (token !== generation) return;
    const created = await createGpuLayer({ canvas, profile, framing, signal: abort.signal, gpuTimer: debug, invalidate: () => { dirty = true; schedule(); } });
    if (token !== generation || destroyed) { created.dispose(); return; }
    layer = created; liveAt = 0; lastFrame = 0;
    layer.resize(innerWidth, innerHeight, { profile, framing });
    dirty = true; schedule();
  } catch (error) {
    if (token === generation && error?.name !== 'AbortError') fail('3D unavailable, posters shown', error, 'TRYB LEKKI · 3D NIEDOSTĘPNE');
  }
}

function begin() {
  ({ profile, reason } = selectProfile({ qa: qa.quality, choice, reduced: reduce.matches, saveData: navigator.connection?.saveData }));
  if (profile === 'calm') { stop(); return; }
  relayout('full');
  if ('requestIdleCallback' in window) requestIdleCallback(() => start(profile), { timeout: 600 });
  else setTimeout(() => start(profile), 100);
}

powerButton.disabled = false; aiButton.disabled = false; motionButton.hidden = false;
powerButton.addEventListener('click', () => { manualPower = !(lastPower ?? false); setPower(manualPower); dirty = true; schedule(); });
aiButton.addEventListener('click', () => { manualAI = !aiPanel.classList.contains('is-open'); setAI(manualAI); dirty = true; schedule(); });
motionButton.addEventListener('click', () => {
  if (root.dataset.motion === 'static') { choice = 'motion'; persist('motion'); reason = 'user'; start('cinematic'); }
  else { choice = 'calm'; persist('calm'); stop(); }
});
window.addEventListener('scroll', () => { dirty = true; schedule(); }, { passive: true });
window.addEventListener('resize', () => {
  const next = framingFor(innerWidth);
  if (next !== framing) { framing = next; root.dataset.framing = framing; }
  root.dataset.compact = String(isCompact(innerWidth, innerHeight));
  measure();
}, { passive: true });
window.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse' && !qa.freeze) pointer = [event.clientX / innerWidth - .5, event.clientY / innerHeight - .5];
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; lastFrame = 0; return; }
  controller.hold(performance.now(), 1000); lastFrame = 0; dirty = true; schedule();
});
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); if (layer || abort) fail('WebGL context lost', event.type, 'TRYB LEKKI · KONTEKST GRAFIKI UTRACONY'); });
canvas.addEventListener('webglcontextrestored', () => { if (choice !== 'calm' && (choice === 'motion' || !reduce.matches)) start('balanced'); });
reduce.addEventListener('change', () => { if (choice) return; if (reduce.matches) stop(); else begin(); });
if ('ResizeObserver' in window) { const observer = new ResizeObserver(measure); observer.observe(document.querySelector('main')); observer.observe(document.querySelector('#zrodla')); }
window.addEventListener('pagehide', event => { if (raf) cancelAnimationFrame(raf); raf = 0; if (!event.persisted) { destroyed = true; generation++; abort?.abort(); layer?.dispose(); layer = null; } });
window.addEventListener('pageshow', () => { if (!destroyed) { lastFrame = 0; controller.hold(performance.now(), 1000); measure(); } });

if (debug) Object.defineProperty(window, 'krzemDebug', { get: () => ({
  ...story, profile, reason, framing, switch: switchView(performance.now()), mode: root.dataset.motion, rafActive: !!raf, live: !!liveAt, ambient, parallax,
  window: controller.last, intervals: intervals.map(([dt]) => dt), cpu: intervals.map(([, c]) => c),
  gpuMs: layer?.gpuTimes ? [...layer.gpuTimes] : null,
  reset() { intervals.length = 0; if (layer?.gpuTimes) layer.gpuTimes.length = 0; }, gpu: layer?.diagnostics ?? null,
}) });

root.dataset.framing = framing; root.dataset.compact = String(isCompact(innerWidth, innerHeight));
begin();
measure();
if (qa.index >= 0) window.scrollTo(0, reader.positionOf(qa.index, qa.progress));
else if (location.hash && motionFull()) document.getElementById(location.hash.slice(1))?.scrollIntoView();
