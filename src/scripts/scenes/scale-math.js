/**
 * Chapter 03: the interconnect stack above the transistors, pure data and math (node-tested).
 * Lengths in nm, the same frame as transistor-math.js: x, y horizontal, z up, the top of the
 * isolation oxide at z = 0, the chapter 02 FinFET at the origin.
 *
 * Sources and what is assumed: docs/SCIENCE.md. Verified: the lowest interconnect pitch 52 nm and
 * levels at 80 and 160 nm pitch (Intel 14 nm, 2014); that upper levels are thicker, wider and more
 * widely spaced, and that complex chips have over 15 levels (see SCIENCE.md). Assumed: the pitches
 * above 160 nm, every thickness, the segment lengths and the via density.
 */
import { clamp, smoothstep } from '../story/timeline.js';
import { seeded } from './legacy-math.js';
import { DIM, transistorCamera } from './transistor-math.js';

/**
 * Levels bottom to top. pitch in nm; aspect = thickness / width; len, gap: segment and gap lengths
 * in pitches; every: only every n-th track is used ((k - 1) mod n = 0); continuous: one segment per track.
 */
export const STACK = [
  { name: 'M1', pitch: 52, aspect: 1.8, len: [3, 14], gap: [1, 4], metal: 'lower', via: .14 },
  { name: 'M2', pitch: 52, aspect: 1.8, len: [3, 16], gap: [1, 4], metal: 'lower', via: .12 },
  { name: 'M3', pitch: 52, aspect: 1.8, len: [4, 18], gap: [1, 4], metal: 'lower', via: .12 },
  { name: 'M4', pitch: 80, aspect: 1.9, len: [4, 18], gap: [1, 4], metal: 'lower', via: .12 },
  { name: 'M5', pitch: 80, aspect: 1.9, len: [4, 20], gap: [1, 4], metal: 'lower', via: .12 },
  { name: 'M6', pitch: 160, aspect: 2, len: [5, 22], gap: [1, 4], metal: 'copper', via: .14 },
  { name: 'M7', pitch: 160, aspect: 2, len: [5, 24], gap: [1, 4], metal: 'copper', via: .14 },
  { name: 'M8', pitch: 320, aspect: 2, len: [6, 30], gap: [1, 4], metal: 'copper', via: .16, every: 2 },
  { name: 'M9', pitch: 640, aspect: 2, len: [6, 34], gap: [1, 3], metal: 'copper', via: .18, every: 2 },
  { name: 'M10', pitch: 1280, aspect: 2, len: [4, 24], gap: [1, 3], metal: 'thick', via: .35, every: 2 },
  // Top level: wide power straps on every third track, unbroken (occupancy and continuity assumed).
  { name: 'M11', pitch: 4000, aspect: 1.5, len: [1, 1], gap: [1, 1], metal: 'thick', via: .5, every: 3, continuous: true },
];
/** Top of the contacts: the first level starts here. */
export const CONTACT_TOP = 130;
/** The transistor rows (real instanced geometry) cover |x|, |y| < FEOL_EXTENT. */
export const FEOL_EXTENT = 1500;

/** Heights and extents of every level. */
export function stack() {
  let z = CONTACT_TOP, prev = null;
  return STACK.map((level, i) => {
    const width = level.pitch / 2, thick = level.aspect * width;
    const base = prev ? prev.top + prev.thick * .9 : z;
    const top = base + thick;
    // Real geometry is generated over a square that grows with the pitch (about 40 tracks to each
    // side); beyond it the level is drawn as a flat texture (scale.js).
    const extent = clamp(50 * level.pitch, 4500, 160000);
    prev = { ...level, index: i, width, thick, base, top, extent, dir: i % 2 ? 'y' : 'x' };
    return prev;
  });
}
export const LEVELS = stack();
export const STACK_TOP = LEVELS.at(-1).top;

/**
 * Build-up: level i is deposited (grows from its base) while u runs over BUILD[i], bottom level
 * first, the order of fabrication; the two thick top levels rise around the camera as it climbs
 * into the reveal. growth(u) -> array of 0..1 per level.
 */
export const BUILD = [.19, .21, .23, .25, .27, .29, .31, .33, .35, .4, .46].map((start, i) => [start, start + (i < 9 ? .05 : .07)]);
export function growth(u) {
  return BUILD.map(([a, b]) => smoothstep(a, b, u));
}
/** Height of the deposited stack (its current top), for the depth darkening. */
export function buildHeight(u) {
  const g = growth(u);
  let h = 100;
  LEVELS.forEach((l, i) => { if (g[i] > 0) h = l.base + l.thick * g[i]; });
  return h;
}

// ---- camera -----------------------------------------------------------------------------------
/** Model die: rectangle in nm (4 x 3 mm, an illustrative size) and its thickness. */
export const DIE = { x: [-3.5e6, .5e6], y: [-.45e6, 2.55e6], thickness: 3e5 };

function fromPose({ position, target, fov, shift }) {
  const d = Math.hypot(...position.map((v, i) => v - target[i]));
  const v = position.map((p, i) => (p - target[i]) / d);
  return { target, d, az: Math.atan2(-v[0], -v[1]), el: Math.asin(v[2]), fov, shift };
}

/**
 * Control frames: entry (the chapter 02 camera at its end), repetition, inside the layers,
 * reveal (low over the top metal), exit (the die as an object).
 * az, el: direction from the target to the camera (as in transistorCamera).
 */
export const KEYS = [0, .16, .3, .6, .8, 1];
export function keyframes(framing = 'desktop') {
  const m = framing === 'mobile';
  return [
    { ...fromPose(transistorCamera(1, framing)), aperture: .06 },
    { target: [60, 0, 40], d: m ? 3600 : 2400, az: .7, el: .52, fov: m ? 34 : 30, shift: m ? [0, -.3] : [.22, 0], aperture: .05 },
    // Above the deposition front, looking down across the crossing middle levels; the thick top
    // levels then rise around the camera as it climbs.
    { target: [-200, 100, 700], d: 2000, az: .75, el: .78, fov: m ? 52 : 40, shift: m ? [0, -.25] : [.16, 0], aperture: .035 },
    // Reveal: an oblique view from just above the top straps, about 23 degrees down: two or three
    // thick straps cross the near third, through the openings the eye falls past the middle levels
    // to the fine ones; the structure repeats to a horizon at the top of the frame. The sun comes
    // from the right, so the left (under the heading) is the shadow side.
    { target: [2500, 2000, 3500], d: 15000, az: .95, el: .5, fov: m ? 60 : 50, shift: m ? [0, -.5] : [.2, .02], aperture: .012 },
    // The die corner: pad ring, seal ring, floorplan blocks, the real stack somewhere inside.
    { target: [-1.2e5, 2.6e5, STACK_TOP], d: m ? 2.4e6 : 1.6e6, az: .9, el: .78, fov: m ? 36 : 30, shift: m ? [0, -.55] : [.24, 0], aperture: .008 },
    { target: [(DIE.x[0] + DIE.x[1]) / 2, (DIE.y[0] + DIE.y[1]) / 2, 0], d: m ? 1.6e7 : 9e6, az: 1.0, el: .95, fov: m ? 36 : 30, shift: m ? [0, -.5] : [.24, 0], aperture: .012 },
  ];
}

/** Monotone cubic (Fritsch-Carlson) through (xs, ys): C1, no overshoot, flat at both ends. */
function pchip(xs, ys) {
  const n = xs.length, h = [], s = [], m = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) { h[k] = xs[k + 1] - xs[k]; s[k] = (ys[k + 1] - ys[k]) / h[k]; }
  for (let k = 1; k < n - 1; k++) {
    if (s[k - 1] * s[k] <= 0) continue;
    const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
    m[k] = (w1 + w2) / (w1 / s[k - 1] + w2 / s[k]);
  }
  return x => {
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) k++;
    const t = clamp((x - xs[k]) / h[k]), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h[k] * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h[k] * m[k + 1];
  };
}

const paths = {};
function path(framing) {
  if (paths[framing]) return paths[framing];
  const keys = keyframes(framing);
  const channel = f => pchip(KEYS, keys.map(f));
  // The target moves in proportion to the zoom: interpolated against log(d), not u, so a point
  // stays in view while the camera pulls out by orders of magnitude.
  const logd = channel(k => Math.log(k.d));
  return (paths[framing] = {
    logd, az: channel(k => k.az), el: channel(k => k.el), fov: channel(k => k.fov),
    sx: channel(k => k.shift[0]), sy: channel(k => k.shift[1]), aperture: channel(k => k.aperture),
    target: [0, 1, 2].map(i => channel(k => k.target[i])),
  });
}

/** Camera for chapter progress u; drift: ambient phase (rad), a slight sway. */
export function scaleCamera(u = 0, framing = 'desktop', drift = 0) {
  u = clamp(u);
  const p = path(framing);
  const d = Math.exp(p.logd(u)), az = p.az(u) + Math.sin(drift) * .006, el = p.el(u) + Math.sin(drift * .7) * .004;
  const target = p.target.map(f => f(u));
  const dir = [-Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)];
  return { position: target.map((v, i) => v + dir[i] * d), target, d, up: [0, 0, 1], fov: p.fov(u), shift: [p.sx(u), p.sy(u)], aperture: p.aperture(u) };
}

// ---- routing ----------------------------------------------------------------------------------
/** Clearance around the camera path: metal never comes closer than this (nm). */
/** Clearance around the camera path: metal never comes closer than this (nm); wide lines keep more. */
function clearance(cam, level) { return Math.min(.45 * cam.d, 1500) + level.width; }

/** Camera samples along the whole path (both framings), for clearing a street through the stack. */
function cameraSamples() {
  const out = [];
  for (const framing of ['desktop', 'mobile']) for (let i = 0; i <= 300; i++) out.push({ ...scaleCamera(i / 300, framing), u: i / 300 });
  return out;
}
/** Metal the camera passes close to is deposited only after it has passed: last u it is near, plus a margin. */
export const AFTER = { margin: .03, span: .04 };
function after(box, near, level) {
  let last = -1;
  for (const c of near) if (boxDistance(c.position, box.min, box.max) <= clearance(c, level)) last = Math.max(last, c.u);
  return last < 0 ? 0 : Math.min(1, last + AFTER.margin);
}

/** Distance from point p to an axis-aligned box. */
function boxDistance(p, min, max) {
  return Math.hypot(...p.map((v, i) => Math.max(min[i] - v, 0, v - max[i])));
}

/**
 * Seeded routing on a track grid. Per level: tracks at (k + 1/2) * pitch across the preferred
 * direction; along each track, segments and gaps of seeded lengths (a walk, so segments on one
 * track never overlap); every 8th track is a power rail (wider, unbroken). Metal the camera would
 * pass through gets `after`: the u from which it may be deposited (0 = with its level). Vias join
 * two adjacent levels only where both have metal.
 * Returns { levels: [{ ...level, segments: [{ min, max, after }], vias: [{ min, max, after }] }] }.
 */
export function route(seed = 3, samples = cameraSamples()) {
  const rand = seeded(seed);
  const levels = LEVELS.map(level => {
    const { pitch, width, extent: E, dir } = level;
    const along = dir === 'x' ? 0 : 1, across = 1 - along;
    const K = Math.floor(E / pitch);
    const segments = [];
    for (let k = -K; k < K; k++) {
      if (level.every && ((k - 1) % level.every + level.every) % level.every) continue;
      const c = (k + .5) * pitch;
      const rail = level.continuous || (k & 7) === 3;
      const w = rail && !level.continuous ? Math.min(width * 1.6, pitch - width * .6) : width;
      let s = -E + rand() * level.gap[1] * pitch;
      while (s < E) {
        const len = rail ? 2 * E : (level.len[0] + rand() * (level.len[1] - level.len[0])) * pitch;
        const e = Math.min(E, s + len);
        if (rail || rand() > .08) {
          const min = [0, 0, level.base], max = [0, 0, level.top];
          min[along] = s; max[along] = e; min[across] = c - w / 2; max[across] = c + w / 2;
          segments.push({ min, max, track: k });
        }
        s = e + (level.gap[0] + rand() * (level.gap[1] - level.gap[0])) * pitch;
      }
    }
    return { ...level, segments };
  });
  // The camera's street: metal it would pass through is deposited behind it (only samples at this
  // level's height matter), so the finished stack has no holes.
  for (const level of levels) {
    const near = samples.filter(c => c.position[2] > level.base - clearance(c, level) && c.position[2] < level.top + clearance(c, level));
    for (const sg of level.segments) sg.after = after(sg, near, level);
  }
  // Vias at crossings of adjacent levels where both have metal.
  for (let i = 1; i < levels.length; i++) {
    const lo = levels[i - 1], hi = levels[i], vias = [];
    const index = level => {
      const map = new Map();
      for (const sg of level.segments) (map.get(sg.track) ?? map.set(sg.track, []).get(sg.track)).push(sg);
      return map;
    };
    const loTracks = index(lo), hiTracks = index(hi);
    const size = Math.min(lo.width, hi.width) * .9;
    for (const [kl, ls] of loTracks) for (const [kh, hs] of hiTracks) {
      // Crossing point: lo runs along lo.dir at offset (kl + .5) * lo.pitch, hi along the other axis.
      const pLo = (kl + .5) * lo.pitch, pHi = (kh + .5) * hi.pitch;
      const x = lo.dir === 'x' ? pHi : pLo, y = lo.dir === 'x' ? pLo : pHi;
      if (Math.abs(x) > lo.extent || Math.abs(y) > lo.extent) continue;
      const inside = sg => x - size / 2 >= sg.min[0] && x + size / 2 <= sg.max[0] && y - size / 2 >= sg.min[1] && y + size / 2 <= sg.max[1];
      const a = ls.find(inside), b = hs.find(inside);
      if (!a || !b) continue;
      if (rand() > hi.via) continue;
      vias.push({ min: [x - size / 2, y - size / 2, lo.top], max: [x + size / 2, y + size / 2, hi.base], after: Math.max(a.after, b.after) });
    }
    // Vias in the street likewise come after the camera (and never before the metal they join).
    const near = samples.filter(c => c.position[2] > lo.top - clearance(c, hi) && c.position[2] < hi.base + clearance(c, hi));
    for (const v of vias) v.after = Math.max(v.after, after(v, near, hi));
    hi.vias = vias;
  }
  levels[0].vias = [];
  return { levels };
}

/**
 * Transistor rows under the stack (same pitches as chapter 02): fins along x, gates along y,
 * raised source/drain between gates, some trench contacts. Cells break every 8 fin rows.
 * The chapter 02 device (fins at y = -42, 0, 42 under the gate at x = 0) is one of them.
 */
export function transistorRows(seed = 5, extent = FEOL_EXTENT) {
  const rand = seeded(seed);
  const P = DIM.finPitch, G = DIM.gatePitch, out = { fins: [], gates: [], epi: [], contacts: [] };
  const rows = Math.floor(extent / P), cols = Math.floor(extent / G);
  for (let j = -rows; j <= rows; j++) {
    if (((j % 8) + 8) % 8 === 4) continue; // cell boundary: no fin
    out.fins.push({ min: [-extent, j * P - DIM.finWidth / 2, 0], max: [extent, j * P + DIM.finWidth / 2, DIM.finHeight] });
    for (let i = -cols; i < cols; i++) {
      const x = (i + .5) * G;
      out.epi.push({ min: [x - 17, j * P - 9, 26], max: [x + 17, j * P + 9, 46] });
    }
  }
  for (let i = -cols; i <= cols; i++) for (let c = Math.floor(-rows / 8); c <= Math.ceil(rows / 8); c++) {
    const y0 = (c * 8 - 4) * P + P * .6, y1 = (c * 8 + 4) * P - P * .6;
    if (y1 < -extent || y0 > extent) continue;
    out.gates.push({ min: [i * G - DIM.gateLength / 2 - 8, Math.max(y0, -extent), 0], max: [i * G + DIM.gateLength / 2 + 8, Math.min(y1, extent), 84] });
    if (rand() < .45) {
      const x = (i + .5) * G, r0 = c * 8 - 3 + Math.floor(rand() * 3);
      out.contacts.push({ min: [x - 12, r0 * P - 10, 48], max: [x + 12, (r0 + 3) * P + 10, CONTACT_TOP] });
    }
  }
  return out;
}

/**
 * Die floorplan for the far views: seeded blocks over DIE (x0, y0, x1, y1, type: 0 logic,
 * 1 memory array, 2 analog/IO). The block holding the origin (where the 3D stack is) is logic.
 */
export function floorplan(seed = 9) {
  const rand = seeded(seed), out = [];
  const margin = 2.2e5, gap = 4e4;
  const split = (x0, y0, x1, y1, depth) => {
    const w = x1 - x0, h = y1 - y0;
    if (depth > 3 || (depth > 1 && rand() < .3) || Math.min(w, h) < 5e5) {
      const type = rand() < .3 ? 1 : rand() < .2 ? 2 : 0;
      out.push([x0 + gap / 2, y0 + gap / 2, x1 - gap / 2, y1 - gap / 2, type]);
      return;
    }
    const vertical = w > h ? rand() < .8 : rand() < .2, t = .3 + rand() * .4;
    if (vertical) { const m = x0 + w * t; split(x0, y0, m, y1, depth + 1); split(m, y0, x1, y1, depth + 1); }
    else { const m = y0 + h * t; split(x0, y0, x1, m, depth + 1); split(x0, m, x1, y1, depth + 1); }
  };
  split(DIE.x[0] + margin, DIE.y[0] + margin, DIE.x[1] - margin, DIE.y[1] - margin, 0);
  for (const b of out) if (b[0] < 0 && b[2] > 0 && b[1] < 0 && b[3] > 0) b[4] = 0;
  return out.slice(0, 24);
}
