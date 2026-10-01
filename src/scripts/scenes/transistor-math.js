/**
 * Chapter 02: a cut-away FinFET, pure data and math (no Three.js, node-tested). Lengths in nm,
 * x along the fins (source -> drain), y across the fins, z up; the top of the isolation oxide is
 * z = 0. Sources and what is assumed: docs/SCIENCE.md.
 *
 * Verified (Intel 14 nm, M. Bohr 2014): fin pitch 42, fin height above the isolation 42, fin
 * width 8, contacted gate pitch 70, interconnect pitch 52. Gate length 20 nm is NIEZWERYFIKOWANE
 * (search summary of the IEDM 2014 paper). Everything else (spacers, contact and metal heights,
 * the isolation depth, the epitaxial source/drain shape) is a plausible assumption.
 */
import { clamp, smoothstep } from '../story/timeline.js';

export const DIM = { finPitch: 42, finHeight: 42, finWidth: 8, gatePitch: 70, gateLength: 20, metalPitch: 52 };
const FINS = [-1, 0, 1].map(i => i * DIM.finPitch);
/**
 * The cut-away, removed: x < 0 and y < NOTCH_Y (the front quarter, y through the front fin's
 * centre, so the gate is seen wrapping the fin and the fin is cut lengthwise), and x < 0 above
 * CUT_Z (metal peeled back over the source half, so its lines are seen in section).
 */
export const NOTCH_Y = FINS[0];
export const CUT_Z = 100;
const X = 84, Y = 84; // specimen half size

/**
 * Components as boxes: centre, half size, optional rotation about x (rad), edge radius, priority.
 * Nested solids (fin inside its gate dielectric inside the gate) are drawn so that the higher
 * priority wins on the section faces.
 */
export function components() {
  const out = [], L = DIM.gateLength / 2, H = DIM.finHeight, W = DIM.finWidth / 2;
  const box = (kind, center, half, opts = {}) => out.push({ kind, center, half, angle: 0, round: 1.5, priority: 0, ...opts });
  box('silicon', [0, 0, -56], [X, Y, 16], { priority: 0 });
  box('oxide', [0, 0, -20], [X, Y, 20], { priority: 1, round: .5 });
  for (const y of FINS) {
    box('silicon', [0, y, H / 2], [X, W, H / 2], { priority: 8, round: 3, fin: true });
    box('silicon', [0, y, -20], [X, W + 2, 20], { priority: 8, round: 0 });
  }
  for (const gx of [-DIM.gatePitch, 0, DIM.gatePitch]) {
    const dummy = gx !== 0;
    // Gate stack around each fin: high-k dielectric, then a work-function metal (TiN), then the
    // fill metal; a nitride cap on top; nitride spacers on both sides.
    for (const y of FINS) {
      box('dielectric', [gx, y, H / 2 + 1], [L, W + 2, H / 2 + 2], { priority: 6, round: 1 });
      box('tin', [gx, y, H / 2 + 2], [L, W + 3.5, H / 2 + 3.5], { priority: 5, round: 2 });
    }
    box('dielectric', [gx, 0, 1], [L, 76, 1], { priority: 6, round: 0 });
    box('tin', [gx, 0, 2.75], [L, 76, .75], { priority: 5, round: 0 });
    box('gate', [gx, 0, 37], [L, 76, 37], { priority: 4, round: 2, dummy });
    box('nitride', [gx, 0, 79], [L, 76, 5], { priority: 3, round: 1.5 });
    for (const s of [-1, 1]) box('nitride', [gx + s * (L + 4), 0, 42], [4, 76, 42], { priority: 3, round: 1.5 });
  }
  // Raised source/drain: faceted epitaxy around each fin between the spacers (a box turned 45
  // degrees about x reads as the diamond cross-section of real epi).
  for (const sx of [-1, 1]) for (const y of FINS) box('epi', [sx * 35, y, 36], [17, 9, 9], { angle: Math.PI / 4, priority: 7, round: 1.5 });
  // Trench contacts land on the epi of the back two fins; the front fin's epi stays in view.
  for (const sx of [-1, 1]) {
    box('liner', [sx * 35, 16, 72], [13.2, 51.2, 25.2], { priority: 2, round: 2 });
    box('tungsten', [sx * 35, 16, 72], [12, 50, 24], { priority: 2.2, round: 2 });
  }
  box('liner', [0, 66, 88], [8.2, 7.2, 11.2], { priority: 9, round: 1.5 });
  box('tungsten', [0, 66, 88], [7, 6, 10], { priority: 9.2, round: 1.5 });
  // Vias and the first metal level (copper in a thin barrier liner), lines along x at 52 nm pitch.
  for (const [x, y] of [[-30, -26], [30, 26], [0, 78]]) box('copper', [x, y, 103], [7, 7, 7], { priority: 5, round: 1 });
  for (const y of [-78, -26, 26, 78]) {
    box('liner', [0, y, 128], [X, 14.2, 19.2], { priority: 4, round: 1.5 });
    box('copper', [0, y, 128], [X, 13, 18], { priority: 5, round: 1.5 });
  }
  return out;
}

// ---- vectors ---------------------------------------------------------------------------------
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/** Points the labels and the carriers refer to. */
export const ANCHORS = {
  source: [-38, NOTCH_Y, 46],
  gate: [4, -70, 74],
  drain: [35, -54, 40],
  fin: [0, NOTCH_Y - 3, 20],
  oxide: [-2, -78, -16],
  contact: [-35, NOTCH_Y, 84],
};

/**
 * Camera for chapter progress p in [0, 1]: a slow orbit and a slight pull-back (room for the
 * camera to keep pulling out in chapter 03). drift: ambient phase (rad).
 */
export function transistorCamera(p = 0, framing = 'desktop', drift = 0) {
  p = clamp(p);
  const mobile = framing === 'mobile';
  const azimuth = .62 + .16 * (smoothstep(0, 1, p) - .5) + Math.sin(drift) * .01;
  const pitch = .8 + Math.sin(drift * .7) * .005;
  const dist = (mobile ? 1180 : 640) * (1 + .1 * smoothstep(.6, 1, p));
  const target = mobile ? [-12, -42, 40] : [-12, -42, 34];
  const dir = [-Math.sin(azimuth) * Math.cos(pitch), -Math.cos(azimuth) * Math.cos(pitch), Math.sin(pitch)];
  const position = target.map((v, i) => v + dir[i] * dist);
  return { position, target, up: [0, 0, 1], fov: mobile ? 26 : 22, shift: mobile ? [.04, -.46] : [.28, -.02] };
}

/** Screen position (fractions of width/height from the top left) of a point; null behind the camera. */
export function project(point, cam, aspect) {
  const back = normalize(sub(cam.position, cam.target));
  const right = normalize(cross(cam.up, back)), up = cross(back, right);
  const d = sub(point, cam.position);
  const z = -dot(d, back);
  if (z <= 0) return null;
  const f = 1 / Math.tan(cam.fov * Math.PI / 360);
  const nx = f / aspect * dot(d, right) / z + cam.shift[0], ny = f * dot(d, up) / z + cam.shift[1];
  return [(nx + 1) / 2, (1 - ny) / 2];
}

/**
 * Where a point given as fractions of a poster (aspect `posterAspect`) lands in a viewport
 * showing that poster with object-fit: cover; returns fractions of the viewport.
 */
export function coverMap([fx, fy], posterAspect, width, height) {
  const w = Math.max(width, height * posterAspect), h = Math.max(height, width / posterAspect);
  return [((fx * w) - (w - width) / 2) / width, ((fy * h) - (h - height) / 2) / height];
}

/** Poster capture: fixed frame (chapter progress .5, no drift) and its pixel size per framing. */
export const POSTER = { progress: .5, desktop: [1600, 1000], mobile: [900, 1400] };

/** Polish label text per anchor, in reading order. */
export const LABELS = { contact: 'Kontakt', gate: 'Bramka', drain: 'Dren', source: 'Źródło', fin: 'Żebro (kanał)', oxide: 'Izolator' };

/**
 * Label layout in the poster's cover box (all values in % of the box). Anchors are projected
 * points; labels go into two columns beside the anchor cluster (left column right-aligned), each
 * column sorted by height with a minimum gap, so labels cannot overlap; thin leaders run from each
 * label to its anchor. `box` is the cover box size in px (spacing is defined in px).
 */
export function labelLayout(anchors, box, framing = 'desktop') {
  const mobile = framing === 'mobile';
  const px = Object.fromEntries(Object.entries(anchors).map(([k, [x, y]]) => [k, [x / 100 * box[0], y / 100 * box[1]]]));
  const xs = Object.values(px).map(p => p[0]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const reach = mobile ? 26 : 70, gap = mobile ? 19 : 30;
  const columns = { left: Math.min(...xs) - reach, right: Math.max(...xs) + reach };
  const out = {};
  for (const side of ['left', 'right']) {
    const keys = Object.keys(px).filter(k => (px[k][0] < mid) === (side === 'left')).sort((a, b) => px[a][1] - px[b][1]);
    // Centre the column on its anchors, then push labels apart top to bottom.
    let y = -Infinity;
    const ys = keys.map(k => (y = Math.max(px[k][1] - (mobile ? 6 : 14), y + gap)));
    const shift = (keys.reduce((s, k) => s + px[k][1], 0) - ys.reduce((s, v) => s + v, 0)) / Math.max(1, keys.length);
    keys.forEach((k, i) => {
      out[k] = { side, x: columns[side] / box[0] * 100, y: (ys[i] + shift) / box[1] * 100, ax: anchors[k][0], ay: anchors[k][1] };
    });
  }
  return out;
}
