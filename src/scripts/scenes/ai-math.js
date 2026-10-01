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
/** Number formatting used by the DOM and the scene: two decimals, a real minus sign, a figure space for positives. */
export const fmt = v => (v < 0 ? '−' : ' ') + Math.abs(v).toFixed(2);
export function demoLines() {
  const { y } = forward();
  return [`[ ${X.map(fmt).join(' ')} ]`, '× W + b → σ', `[ ${y.map(fmt).join(' ')} ]`];
}

/** Stages of the demo, in seconds since it was opened: prompt, numbers, operations, hardware, answer. */
export const STAGES = ['prompt', 'numbers', 'operations', 'hardware', 'answer'];
export const STAGE_AT = [0, .7, 1.5, 3.1, 5.3];
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
  // Traces from the package edge out across the board (Manhattan), most of them to the edge
  // connector at the bottom; a few carry the hardware pulses of the demo.
  const traces = [];
  for (let i = 0; i < 160; i++) {
    const side = Math.floor(r() * 4), a = (r() - .5) * 46;
    let x = side < 2 ? (side ? -24 : 24) : a, y = side < 2 ? a : (side === 2 ? 24 : -24);
    const pts = [[x, y]];
    for (let s = 0; s < 3; s++) {
      if (s % 2 === (side < 2 ? 0 : 1)) x = Math.max(-62, Math.min(62, x + (side === 1 ? -1 : 1) * (6 + r() * 26) * (side < 2 ? 1 : (r() < .5 ? 1 : -1))));
      else y = Math.max(-52, Math.min(52, y + (side === 3 || r() < .6 ? -1 : 1) * (6 + r() * 24)));
      pts.push([x, y]);
    }
    if (r() < .5) { pts.push([pts.at(-1)[0], -53]); }
    traces.push({ pts, w: r() < .15 ? .4 : .16 });
  }
  return { memory, power, caps, traces };
}
/**
 * Lanes the hardware pulses run along (mm, z = surface): from the die to each memory package on
 * the substrate, and from the die down through the substrate edge to the edge connector.
 */
export function pulseLanes() {
  const SUB = -.28, PCB = -1.66, lanes = [];
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
    lanes.push([[s * 2, k * .9, SUB], [s * 3.6, k * .9, SUB], [s * 3.6, k * 9, SUB], [s * 6, k * 9, SUB]]);
  }
  for (const [x0, x1] of [[-1.2, -40], [-.4, -14], [.4, 14], [1.2, 40]]) {
    lanes.push([[x0, -1.5, SUB], [x0, -15, SUB], [x0, -16, PCB], [x0, -24, PCB], [x1, -24 - Math.abs(x1 - x0) * .25, PCB], [x1, -53, PCB]]);
  }
  return lanes;
}
/** Board size (mm) and the edge connector. */
export const BOARD = { size: [130, 112, 1.6], fingers: 48 };

const KEYS = [0, .25, .55, .8, 1];
const paths = {};
/** Camera for chapter progress u: from the die close-up (chapter 04's end) out to the rows of boards. */
export function aiCamera(u, framing = 'desktop', drift = 0) {
  const m = framing === 'mobile';
  paths[framing] ??= cameraPath(KEYS, [
    dieClose(framing),
    // The chip, the number layer above it and the threads between them, clear of the demo panel.
    { target: m ? [0, 3, 5] : [1, 6, 9], d: m ? 150 : 108, az: .66, el: .72, fov: m ? 40 : 32, shift: m ? [0, -.02] : [.24, .1], aperture: .002 },
    { target: [0, -6, 2], d: m ? 230 : 160, az: .55, el: .66, fov: m ? 40 : 32, shift: m ? [0, -.2] : [.26, .14], aperture: .006 },
    { target: [40, 60, 10], d: m ? 520 : 360, az: .62, el: .38, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.06], aperture: .008 },
    { target: [60, 140, 20], d: m ? 800 : 560, az: .6, el: .3, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.06], aperture: .006 },
  ]);
  return paths[framing](u, drift);
}
