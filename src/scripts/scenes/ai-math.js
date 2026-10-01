/**
 * Chapter 05: the arithmetic of the DOM demo and the accelerator board (pure, node-tested).
 * Demonstration data: a small layer y = sigmoid(W x + b). The DOM prints exactly these numbers
 * (and the static HTML carries the same text for no-JS readers; a test checks both).
 */
import { clamp, smoothstep } from '../story/timeline.js';
import { cameraPath } from './scale-math.js';
import { dieClose } from './world-math.js';
import { seeded } from './legacy-math.js';

export const X = [.14, -.08, .91, .33, -.45, .27];
const rand = seeded(5);
export const W = X.map(() => X.map(() => Math.round((rand() * 2 - 1) * 100) / 100));
export const B = X.map(() => Math.round((rand() * .6 - .3) * 100) / 100);
const sigmoid = v => 1 / (1 + Math.exp(-v));
export function forward(x = X) {
  const z = W.map((row, i) => row.reduce((s, w, j) => s + w * x[j], 0) + B[i]);
  return { z, y: z.map(sigmoid) };
}
/** Number formatting used by the DOM and the scene: two decimals, a real minus sign. */
export const fmt = v => (v < 0 ? '−' : ' ') + Math.abs(v).toFixed(2);
export function demoLines() {
  const { y } = forward();
  return [`[ ${X.map(fmt).join(' ')} ]`, '× W + b → σ', `[ ${y.map(fmt).join(' ')} ]`];
}

/** Stages of the demo, in seconds since it was opened: prompt, numbers, operations, hardware, answer. */
export const STAGES = ['prompt', 'numbers', 'operations', 'hardware', 'answer'];
export const STAGE_AT = [0, .7, 1.5, 3.1, 4.2];
export function stageAt(t) { let s = 0; STAGE_AT.forEach((a, i) => { if (t >= a) s = i; }); return s; }
/** How far the row-by-row product has got (0..W.length) and the hardware pulse (0..1) at time t. */
export function demoProgress(t) {
  return { rows: clamp((t - STAGE_AT[2]) / (STAGE_AT[3] - STAGE_AT[2])) * W.length, pulse: clamp((t - STAGE_AT[3]) / (STAGE_AT[4] - STAGE_AT[3])), answer: smoothstep(STAGE_AT[4], STAGE_AT[4] + .4, t) };
}

/** Accelerator board layout (mm, die top centre at the origin): memory stacks, power stages, caps. */
export function acceleratorLayout(seed = 21) {
  const r = seeded(seed);
  const memory = [];
  for (const sx of [-1, 1]) for (const k of [-1, 0, 1]) memory.push({ x: sx * 9.5, y: k * 9, w: 7, h: 8, t: 1.4 });
  const power = [], caps = [];
  for (let i = 0; i < 14; i++) power.push({ x: -45 + i * 6.8, y: -42, w: 5, h: 5, t: 3.2 });
  for (let i = 0; i < 14; i++) power.push({ x: -45 + i * 6.8, y: 42, w: 5, h: 5, t: 3.2 });
  for (let i = 0; i < 220; i++) {
    const x = (r() * 2 - 1) * 60, y = (r() * 2 - 1) * 48;
    if (Math.abs(x) < 24 && Math.abs(y) < 22) continue;
    if (Math.abs(Math.abs(y) - 42) < 4) continue;
    caps.push({ x, y, w: r() < .5 ? 1 : 1.6, h: r() < .5 ? .5 : .8, t: .5 });
  }
  return { memory, power, caps };
}

const KEYS = [0, .25, .55, .8, 1];
const paths = {};
/** Camera for chapter progress u: from the die close-up (chapter 04's end) out to the rows of boards. */
export function aiCamera(u, framing = 'desktop', drift = 0) {
  const m = framing === 'mobile';
  paths[framing] ??= cameraPath(KEYS, [
    dieClose(framing),
    { target: [0, 0, 6], d: m ? 110 : 70, az: .7, el: .7, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.24, -.04], aperture: .012 },
    { target: [0, 0, 8], d: m ? 230 : 150, az: .55, el: .62, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.04], aperture: .01 },
    { target: [40, 60, 10], d: m ? 520 : 360, az: .62, el: .38, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.06], aperture: .008 },
    { target: [60, 140, 20], d: m ? 800 : 560, az: .6, el: .3, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.06], aperture: .006 },
  ]);
  return paths[framing](u, drift);
}
