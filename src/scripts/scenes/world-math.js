/**
 * Chapter 04: the die from chapter 03 assembles into a generic phone-like device (pure data and
 * math, node-tested). Lengths in mm; the die's top centre is the origin, z up. Illustrative: a
 * generic, unbranded device, not to scale except the die (4 x 3 mm, as in chapter 03).
 */
import { clamp, smoothstep } from '../story/timeline.js';
import { seeded } from './legacy-math.js';
import { cameraPath, dieExitFrame } from './scale-math.js';

export const DIE_MM = { w: 4, h: 3, t: .3 };
/** Final positions (centre, size) of the layers; z top of the die is 0. */
export const LAYERS = {
  package: { center: [0, 0, -.75], size: [14, 14, .8] },
  board: { center: [0, -8, -1.95], size: [66, 66, .8] },
  battery: { center: [0, 63, -4.2], size: [60, 70, 4.4] },
  frame: { center: [0, 30, -2.6], size: [72, 150, 8.4], radius: 9 },
  display: { center: [0, 30, 1.25], size: [70, 148, .9], radius: 8 },
  glass: { center: [0, 30, 2.05], size: [72, 150, .7], radius: 9 },
};
/** Where each layer comes from (offset added while it is not yet in place) and when it arrives. */
export const ASSEMBLY = {
  package: { from: [0, 0, -9], at: [.06, .18] },
  board: { from: [0, 0, -26], at: [.14, .3] },
  parts: { from: [0, 0, 6], at: [.24, .38] },
  battery: { from: [0, 0, -40], at: [.32, .46] },
  frame: { from: [0, 0, -60], at: [.4, .54] },
  display: { from: [0, 0, 45], at: [.16, .5] },
  glass: { from: [0, 0, 80], at: [.5, .62] },
};
/** 0 = not yet visible, 1 = in place; with the eased offset. */
export function placement(layer, u) {
  const a = ASSEMBLY[layer], k = smoothstep(a.at[0], a.at[1], u);
  const appear = smoothstep(a.at[0] - .02, a.at[0] + .04, u);
  return { k, appear, offset: a.from.map(v => v * (1 - k)) };
}
/** The order the parts arrive in (for the test and the doc): by arrival end. */
export const ORDER = Object.entries(ASSEMBLY).sort((a, b) => a[1].at[1] - b[1].at[1]).map(([k]) => k);

/** The three words of the heading drive the display: 0 Liczyć, 1 Tworzyć, 2 Łączyć. */
export const WORDS = [.2, .45, .68];
export function activeWord(u) { return u < WORDS[1] ? 0 : u < WORDS[2] ? 1 : 2; }

/** Leibniz series for pi, n terms: a real computation for the "Liczyć" screen. */
export function leibniz(n) {
  let s = 0;
  for (let k = 0; k < n; k++) s += (k % 2 ? -4 : 4) / (2 * k + 1);
  return s;
}

/**
 * Board layout, seeded: integrated circuits (black packages), passives (0402/0201 in rows), a
 * connector, test pads, and Manhattan traces between pads. Board coordinates are relative to the
 * board centre (mm); the package footprint (around the die) is kept clear.
 */
export function boardLayout(seed = 11) {
  const rand = seeded(seed), b = LAYERS.board, bc = b.center, W = b.size[0] / 2 - 3, H = b.size[1] / 2 - 3;
  const keepOut = [{ x: -bc[0], y: -bc[1], w: 16, h: 16 }];
  const free = (x, y, w, h) => Math.abs(x) + w / 2 < W && Math.abs(y) + h / 2 < H
    && keepOut.every(k => Math.abs(x - k.x) > (w + k.w) / 2 + 1 || Math.abs(y - k.y) > (h + k.h) / 2 + 1);
  const chips = [];
  for (const [w, h] of [[11, 11], [9, 7], [7, 7], [6, 4], [5, 5], [4, 3], [8, 5]]) {
    for (let tries = 0; tries < 60; tries++) {
      const x = (rand() * 2 - 1) * (W - w / 2), y = (rand() * 2 - 1) * (H - h / 2);
      if (!free(x, y, w, h)) continue;
      chips.push({ x, y, w, h, t: .7 + rand() * .4 }); keepOut.push({ x, y, w: w + 3, h: h + 3 });
      break;
    }
  }
  const passives = [];
  for (let i = 0; i < 900 && passives.length < 320; i++) {
    const big = rand() < .35, w = big ? 1 : .6, h = big ? .5 : .3, rot = rand() < .5;
    const x = Math.round((rand() * 2 - 1) * W * 2) / 2, y = Math.round((rand() * 2 - 1) * H * 2.5) / 2.5;
    const [ww, hh] = rot ? [h, w] : [w, h];
    if (!free(x, y, ww + .4, hh + .4)) continue;
    passives.push({ x, y, w: ww, h: hh, t: big ? .35 : .3, kind: rand() < .55 ? 'cap' : 'res' });
    keepOut.push({ x, y, w: ww + .2, h: hh + .2 });
  }
  // Traces: from chip and package edges, Manhattan, two layers' worth drawn on top.
  const traces = [];
  const ends = [...chips.map(c => [c.x, c.y, c.w, c.h]), [-bc[0], -bc[1], 14, 14]];
  for (let i = 0; i < 140; i++) {
    const [cx, cy, cw, ch] = ends[Math.floor(rand() * ends.length)];
    const side = Math.floor(rand() * 4);
    let x = cx + (side === 0 ? cw / 2 : side === 1 ? -cw / 2 : (rand() - .5) * cw * .9);
    let y = cy + (side === 2 ? ch / 2 : side === 3 ? -ch / 2 : (rand() - .5) * ch * .9);
    const pts = [[x, y]];
    let horizontal = side < 2;
    for (let s = 0; s < 2 + Math.floor(rand() * 3); s++) {
      const len = 2 + rand() * 14, dir = (side === 1 || side === 3) ? -1 : 1;
      if (horizontal) x = clamp(x + dir * len * (rand() < .8 ? 1 : -1), -W, W); else y = clamp(y + dir * len * (rand() < .8 ? 1 : -1), -H, H);
      pts.push([x, y]); horizontal = !horizontal;
    }
    traces.push({ pts, w: rand() < .2 ? .35 : .12 });
  }
  return { chips, passives, traces };
}

/** Die close-up shared with chapter 05's entry. */
export function dieClose(framing = 'desktop') {
  const m = framing === 'mobile';
  return { target: [0, 0, 0], d: m ? 26 : 16, az: .9, el: .82, fov: m ? 36 : 30, shift: m ? [0, -.5] : [.24, 0], aperture: .012 };
}
const KEYS = [0, .16, .32, .5, .7, .88, 1];
const paths = {};
/** Camera for chapter progress u (from chapter 03's exit frame to the die close-up). */
export function worldCamera(u, framing = 'desktop', drift = 0) {
  const m = framing === 'mobile';
  paths[framing] ??= cameraPath(KEYS, [
    dieExitFrame(framing, 1e-6),
    { target: [0, 0, -1], d: m ? 90 : 55, az: .75, el: .72, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.24, -.02], aperture: .012 },
    // Exploded: the lit display hovers above the board ("Liczyć").
    { target: [0, 22, 22], d: m ? 560 : 350, az: .58, el: .5, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.04], aperture: .01 },
    { target: [0, 28, 8], d: m ? 520 : 330, az: .62, el: .58, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.04], aperture: .01 },
    { target: [0, 30, 0], d: m ? 470 : 300, az: .45, el: .86, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.02], aperture: .01 },
    { target: [0, 26, 0], d: m ? 440 : 280, az: .7, el: .84, fov: m ? 40 : 32, shift: m ? [0, -.45] : [.26, -.02], aperture: .01 },
    dieClose(framing),
  ]);
  return paths[framing](u, drift);
}
