/**
 * Chapter 02: a FinFET seen through its ghosted gate stack, pure data and math (node-tested). Lengths in nm,
 * x along the fins (source -> drain), y across the fins, z up; the top of the isolation oxide is
 * z = 0. Sources and what is assumed: docs/SCIENCE.md.
 *
 * Verified (Intel 14 nm, M. Bohr 2014): fin pitch 42, fin height above the isolation 42, fin
 * width 8, contacted gate pitch 70. Gate length 20 nm is NIEZWERYFIKOWANE (search summary of the
 * IEDM 2014 paper). Everything else (spacers, contact heights, the isolation depth, the epitaxial
 * source/drain shape) is a plausible assumption. The metal levels above are not modelled.
 */
import { clamp, smoothstep } from '../story/timeline.js';

export const DIM = { finPitch: 42, finHeight: 42, finWidth: 8, gatePitch: 70, gateLength: 20 };
const FINS = [-1, 0, 1].map(i => i * DIM.finPitch);
export const FRONT_FIN = FINS[0];
export const FIN_LENGTH = 220;
/** Gap between the glass parts and the isolation top (nm), see components(). */
export const GHOST_LIFT = .5;

/**
 * Fin cross-section used for the drawn fin (nm, y across, z up): tapered from 10 nm at the base to
 * 6 nm under a rounded top, 8 nm (the sourced width) at mid-height. halfWidth(z) for 0 <= z <= H.
 */
export function finHalfWidth(z) { return 5 - 2 * clamp(z / DIM.finHeight); }

/**
 * Components as boxes: centre, half size, edge radius, and how they are drawn: `ghost` parts (the
 * gate stack, spacers, cap, contacts) are smoked glass with lit edges so the fins and the channel
 * are seen through them; `shape` parts (fins, epi) get their own geometry in transistor.js (the box
 * here keeps their sourced extent for tests and anchors).
 */
export function components() {
  const out = [], L = DIM.gateLength / 2, H = DIM.finHeight, W = DIM.finWidth / 2;
  const box = (kind, center, half, opts = {}) => out.push({ kind, center, half, angle: 0, round: 1.5, priority: 0, ghost: false, ...opts });
  // The wafer under the device: isolation oxide on silicon, a clean front edge, running far back.
  box('silicon', [0, 115, -56], [260, 205, 16], { round: 1 });
  box('oxide', [0, 115, -20], [260, 205, 20], { round: 1 });
  for (const y of FINS) {
    box('silicon', [0, y, H / 2], [FIN_LENGTH / 2, W, H / 2], { fin: true, shape: 'fin' });
    // The fin's root inside the isolation; its top stays below the oxide top (a coplanar strip
    // along each fin base z-fought with the oxide and flickered).
    box('silicon', [0, y, -20.25], [FIN_LENGTH / 2, W + 1, 19.75], { round: 0, root: true });
  }
  // One gate (real layouts repeat gates every 70 nm; the neighbours are left out so the device
  // reads as one object: source, gate, drain). Around each fin: high-k dielectric, then the
  // work-function metal (TiN), then the fill metal; a nitride cap on top; nitride spacers.
  // Glass parts stand GHOST_LIFT above the isolation instead of sharing its plane: coplanar (and
  // intersecting) transparent faces on the opaque oxide z-fought and flickered as the camera moved.
  const lift = GHOST_LIFT, span = (z0, z1) => [(z0 + z1) / 2, (z1 - z0) / 2];
  for (const y of FINS) {
    const [dz, dh] = span(lift, H + 2), [tz, th] = span(lift, H + 4);
    box('dielectric', [0, y, dz], [L, W + 2, dh], { round: 2, ghost: true });
    box('tin', [0, y, tz], [L, W + 3.5, th], { round: 3, ghost: true });
  }
  const [gz, gh] = span(lift, 74);
  box('gate', [0, 0, gz], [L, 76, gh], { round: 4, ghost: true, gate: true });
  box('nitride', [0, 0, 79], [L, 76, 5], { round: 2, ghost: true });
  const [sz, sh] = span(lift, 84);
  for (const s of [-1, 1]) box('nitride', [s * (L + 4), 0, sz], [4, 76, sh], { round: 2, ghost: true });
  // Raised source/drain: faceted (diamond-profile) epitaxy around each fin between the spacers.
  for (const sx of [-1, 1]) for (const y of FINS) box('epi', [sx * 35, y, 36], [17, 9, 9], { angle: Math.PI / 4, shape: 'epi' });
  // Trench contacts on the source and drain, with a liner, and the gate contact.
  // (Their barrier liners are thinner than a pixel at these views and are left out.)
  for (const sx of [-1, 1]) box('tungsten', [sx * 35, 16, 72], [12, 50, 24], { round: 3, ghost: true });
  box('tungsten', [0, 40, 95], [7, 6, 10], { round: 2, ghost: true, gateContact: true });
  return out;
}

/**
 * The switch as a sequence (pure): on = target state, s = 0..1 progress of its sequence (about
 * 1.4 s; s = 1 is the settled state). ON: a pulse runs down the gate contact, the gate and its
 * dielectric wrap light up, the channel ignites along the fin surfaces from the source side to the
 * drain side, then the stream breaks through. OFF: the gate dims, the channel pinches off from the
 * drain side, the stream dams up. channel: [from, to] in units of the gate length (-.5 .. .5).
 * Each sequence starts exactly where the opposite settled state is, so an interrupted sequence is
 * simply played backwards: no jumps, fully reversible.
 */
export const SWITCH_MS = 1400;
export function switchState(on, s) {
  s = clamp(s);
  if (on) {
    const front = smoothstep(.36, .78, s);
    return { pulse: s > 0 && s < .32 ? s / .32 : -1, gate: smoothstep(.2, .46, s), channel: [-.5, -.5 + front], stream: smoothstep(.62, 1, s) };
  }
  const pinch = smoothstep(.2, .62, s);
  return { pulse: -1, gate: 1 - smoothstep(0, .34, s), channel: [-.5, .5 - pinch], stream: 1 - smoothstep(.3, .75, s) };
}

// ---- vectors ---------------------------------------------------------------------------------
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/** Points the labels and the carriers refer to. */
export const ANCHORS = {
  source: [-30, FRONT_FIN - 9, 40],
  gate: [4, -62, 70],
  drain: [30, FRONT_FIN - 9, 40],
  fin: [-14, FRONT_FIN - 5, 22],
  oxide: [-30, -66, 0],
  contact: [-35, -30, 92],
};

/**
 * Camera for chapter progress p: the whole device (0), a close three-quarter view of the front fin
 * entering the gate around the middle, where the switch is demonstrated (.38-.62 holds there), and
 * a lift-off to the chapter 03 entry frame (1). drift: ambient phase (rad).
 */
const CAMERA_KEYS = {
  desktop: [
    { az: .4, el: .68, d: 760, target: [0, -46, 22], fov: 22, shift: [.3, -.06] },
    { az: .72, el: .62, d: 330, target: [-2, -42, 30], fov: 22, shift: [.32, -.02] },
    { az: .52, el: .68, d: 820.8, target: [0, -46, 22], fov: 22, shift: [.3, -.06] },
  ],
  mobile: [
    { az: .4, el: .68, d: 1480, target: [0, -46, 22], fov: 24, shift: [.02, -.5] },
    { az: .72, el: .62, d: 600, target: [-2, -42, 30], fov: 24, shift: [.02, -.48] },
    { az: .52, el: .68, d: 1598.4, target: [0, -46, 22], fov: 24, shift: [.02, -.5] },
  ],
};
export function transistorCamera(p = 0, framing = 'desktop', drift = 0) {
  p = clamp(p);
  const [a, b, c] = CAMERA_KEYS[framing === 'mobile' ? 'mobile' : 'desktop'];
  const k1 = smoothstep(0, .38, p), k2 = smoothstep(.62, 1, p);
  const lerp = (f) => { const x = f(a) + (f(b) - f(a)) * k1; return x + (f(c) - f(b)) * k2; };
  const d = Math.exp(lerp(k => Math.log(k.d)));
  const azimuth = lerp(k => k.az) + Math.sin(drift) * .01, pitch = lerp(k => k.el) + Math.sin(drift * .7) * .005;
  const target = [0, 1, 2].map(i => lerp(k => k.target[i]));
  const dir = [-Math.sin(azimuth) * Math.cos(pitch), -Math.cos(azimuth) * Math.cos(pitch), Math.sin(pitch)];
  return { position: target.map((v, i) => v + dir[i] * d), target, up: [0, 0, 1], fov: lerp(k => k.fov), shift: [lerp(k => k.shift[0]), lerp(k => k.shift[1])] };
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
/** On a phone only the four that carry the story. */
export const MOBILE_LABELS = ['source', 'gate', 'drain', 'fin'];

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
