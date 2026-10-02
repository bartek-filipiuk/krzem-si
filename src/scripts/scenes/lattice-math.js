/**
 * Silicon lattice for chapter 01: pure math, no Three.js, so node:test covers it. Lengths in nm,
 * crystal axes = world axes ([001] is up).
 *
 * Diamond cubic: two fcc lattices offset by (1/4, 1/4, 1/4) a, 8 atoms per conventional cell,
 * 4 nearest neighbours at a*sqrt(3)/4 (tetrahedral). Sources in docs/SCIENCE.md.
 * Positions are kept in integer quarter-cell units (q = 4 * position / a): fcc sites have all
 * even coordinates, the shifted sites all odd ones, and every bond is one of four odd steps.
 */
import { clamp, smoothstep } from '../story/timeline.js';

/** CODATA 2022 lattice parameter of silicon, 5.431 020 511(89) x 10^-10 m. */
/** Seeded PRNG (mulberry32): the same seed gives the same scene in every browser and in tests. */
export function seeded(seed = 14028) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const A = .5431020511;
export const BOND = A * Math.sqrt(3) / 4;
const FCC = [[0, 0, 0], [0, 2, 2], [2, 0, 2], [2, 2, 0]];
const STEPS = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => scale(a, 1 / (Math.hypot(...a) || 1));
/** Rodrigues rotation of v about the unit axis k. The vertex shader in lattice.js does the same. */
export function rotate(v, k, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** Lattice sites (quarter units) of every cell overlapping [min, max] (nm) for which keep(p) holds. */
export function diamondCubic(min, max, keep = () => true) {
  const quarters = [];
  const lo = min.map(v => Math.floor(v / A)), hi = max.map(v => Math.ceil(v / A));
  for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++)
    for (const f of FCC) for (const shift of [0, 1]) {
      const q = [4 * i + f[0] + shift, 4 * j + f[1] + shift, 4 * k + f[2] + shift];
      const p = scale(q, A / 4);
      if (p.every((v, n) => v >= min[n] && v <= max[n]) && keep(p)) quarters.push(q);
    }
  return quarters;
}

/** Nearest-neighbour pairs [i, j] among the given sites (each bond once, fcc site first). */
export function bonds(quarters) {
  const index = new Map(quarters.map((q, i) => [q.join(), i]));
  const out = [];
  quarters.forEach((q, i) => {
    if (q[0] & 1) return; // shifted site: its bonds are listed from the fcc side
    for (const s of STEPS) { const j = index.get(add(q, s).join()); if (j !== undefined) out.push([i, j]); }
  });
  return out;
}

/** Seeded grains in a box: centres, rotation axis and angle (radians). */
export function grains(seed, min, max, size) {
  const rand = seeded(seed);
  const extent = sub(max, min);
  const count = Math.max(2, Math.round(extent[0] * extent[1] * extent[2] / size ** 3));
  return Array.from({ length: count }, () => {
    const centre = min.map((v, i) => v + rand() * extent[i]);
    const z = 2 * rand() - 1, phi = 2 * Math.PI * rand(), r = Math.sqrt(1 - z * z);
    const angle = (14 + 26 * rand()) * Math.PI / 180 * (rand() < .5 ? -1 : 1);
    return { centre, axis: [r * Math.cos(phi), r * Math.sin(phi), z], angle };
  });
}

/**
 * Grain of each atom (nearest centre of its lattice position) and whether it is drawn in the
 * polycrystal: only if its rotated position stays inside its own Voronoi cell by `margin`, so
 * neighbouring grains never overlap and the boundaries read as thin gaps.
 */
export function assignGrains(positions, list, margin) {
  const grain = new Uint16Array(positions.length), visible = new Uint8Array(positions.length);
  positions.forEach((p, i) => {
    let best = 0, bestD = Infinity;
    list.forEach((g, n) => { const d = sub(p, g.centre); const dd = dot(d, d); if (dd < bestD) { bestD = dd; best = n; } });
    const g = list[best];
    const r = add(g.centre, rotate(sub(p, g.centre), g.axis, g.angle));
    const own = dot(sub(r, g.centre), sub(r, g.centre));
    grain[i] = best;
    visible[i] = list.every((h, n) => {
      if (n === best) return true;
      const gap = sub(h.centre, g.centre), d = sub(r, h.centre);
      return (dot(d, d) - own) / (2 * Math.hypot(...gap)) >= margin; // distance to the bisector plane
    }) ? 1 : 0;
  });
  return { grain, visible };
}

// ---- camera and front ------------------------------------------------------------------------
/** Viewing axis of the final frame: [110], the direction with open hexagonal channels. */
export const CHANNEL_DIR = normalize([1, 1, 0]);
const UP = [0, 0, 1];
const RIGHT = cross(CHANNEL_DIR, UP);
/** A channel axis: (x - y)/sqrt2 = a/(2 sqrt2), z = a/8 is 3a/8 from the six atom columns around it. */
export const CHANNEL_POINT = scale([.25, -.25, .125], A);
/** The scale bar is true for this distance in front of the camera (nm). */
export const FOCUS = 2;
const TRAVEL = 3.2;

/**
 * Lattice camera for u in [0, 1] (0: the lattice starts to emerge in the hero, .2: chapter 01
 * pins, 1: chapter 01 ends). It glides forward along a [110] channel, decelerating to rest, and
 * turns from an oblique view onto the channel axis while the crystal orders. `drift` (radians of
 * ambient phase) adds a slow sway of amplitude `amp` (0: none, for the hand-over to the wafer). framing: lens shift puts the vanishing point beside the text.
 */
export function latticeCamera(u, framing = 'desktop', drift = 0, amp = 1) {
  u = clamp(u);
  const align = smoothstep(.55, .95, u);
  const yaw = (1 - align) * 24 * Math.PI / 180 + Math.sin(drift) * .006 * amp;
  const pitch = (1 - align) * -9 * Math.PI / 180 + Math.sin(drift * .73) * .004 * amp;
  const forward = rotate(rotate(CHANNEL_DIR, UP, yaw), RIGHT, pitch);
  const travel = -TRAVEL * (1 - u) ** 2.2;
  const offset = add(scale(RIGHT, .55), scale(UP, .3));
  const sway = scale(add(scale(RIGHT, Math.sin(drift * .9) * .015), scale(UP, Math.sin(drift * .61) * .012)), amp);
  const position = add(add(add(CHANNEL_POINT, scale(CHANNEL_DIR, travel)), scale(offset, 1 - align)), sway);
  const mobile = framing === 'mobile';
  return { position, forward: normalize(forward), up: UP, fov: mobile ? 58 : 44, shift: mobile ? [0, -.28] : [.26, 0] };
}

/**
 * Crystallisation front: atoms with dot(position, normal) < offset are monocrystal. The plane is
 * nearly horizontal (tilted 20 degrees towards the viewing axis) and contains the frame's
 * horizontal, so its hot edge crosses the whole width of the frame and rises from the bottom
 * to the top of the in-focus plane: lower third at chapter progress .25, upper third at .5,
 * everything visible ordered by ~.85. The offset is measured from the camera, so the sweep does
 * not depend on the glide. heat: strength of the amber band, zero before and after the sweep.
 */
export const FRONT_NORMAL = normalize(add(scale(UP, .94), scale(CHANNEL_DIR, .34)));
const FRONT_KEYS = [[.27, -.9], [.4, .1], [.6, .5], [.76, 1.6], [.88, 3.2]];
export function latticeFront(u) {
  const keys = FRONT_KEYS, last = keys.length - 1;
  let i = 0;
  while (i < last - 1 && u > keys[i + 1][0]) i++;
  const k = clamp((u - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
  const local = keys[i][1] + (keys[i + 1][1] - keys[i][1]) * k;
  const sweep = clamp((u - keys[0][0]) / (keys[last][0] - keys[0][0]));
  return { normal: FRONT_NORMAL, offset: dot(latticeCamera(u).position, FRONT_NORMAL) + local, heat: sweep > 0 && sweep < 1 ? Math.sin(Math.PI * sweep) ** .35 : 0 };
}

/** The camera poses the block must cover: the whole path, both framings' extents. */
function poses(framing) {
  const out = [];
  for (let i = 0; i <= 20; i++) {
    const cam = latticeCamera(i / 20, framing);
    const right = normalize(cross(cam.forward, cam.up)), up = cross(right, cam.forward);
    const tanV = Math.tan(cam.fov * Math.PI / 360);
    // Widest supported aspect per framing, widened by the lens shift on the shifted side.
    const tanH = tanV * (framing === 'mobile' ? .8 : 2) * (1 + Math.abs(cam.shift[0]));
    out.push({ position: cam.position, forward: cam.forward, right, up, tanH, tanV: tanV * (1 + Math.abs(cam.shift[1])) });
  }
  return out;
}

/**
 * Everything the GPU needs for one framing and level of detail. far: fog end (nm); atoms beyond
 * it are invisible anyway. Deterministic for a seed.
 */
export function buildLattice({ seed = 14, framing = 'desktop', far = 4.4, margin = .45, grainSize = 2.6 } = {}) {
  const views = poses(framing);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const v of views) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const d of [0, far]) {
    const p = add(v.position, add(scale(v.forward, d), add(scale(v.right, sx * d * v.tanH), scale(v.up, sy * d * v.tanV))));
    p.forEach((c, i) => { min[i] = Math.min(min[i], c - margin); max[i] = Math.max(max[i], c + margin); });
  }
  const inView = p => views.some(v => {
    const d = sub(p, v.position), z = dot(d, v.forward);
    return z > -margin && z < far + margin && Math.abs(dot(d, v.right)) < z * v.tanH + margin && Math.abs(dot(d, v.up)) < z * v.tanV + margin;
  });
  const quarters = diamondCubic(min, max, inView);
  const positions = quarters.map(q => scale(q, A / 4));
  const list = grains(seed, min, max, grainSize);
  const { grain, visible } = assignGrains(positions, list, .09);
  const pairs = bonds(quarters);
  const hash = seeded(seed + 1);
  return {
    positions, grain, visible, pairs, grains: list, box: [min, max],
    hashes: Float32Array.from(positions, () => hash()),
    bondVisible: Uint8Array.from(pairs, ([i, j]) => grain[i] === grain[j] && visible[i] && visible[j] ? 1 : 0),
  };
}

/**
 * Scale bar for a perspective camera: pixels per nm at `distance` in front of it, for a viewport
 * `height` CSS px tall and a vertical FOV in degrees. Picks a round length close to `target` px.
 */
const BAR_STEPS = [.05, .1, .2, .5, 1, 2, 5, 10, 20, 50, 100, 200, 500].flatMap(v => [v, v * 1e3, v * 1e6]).filter(v => v < 1e7).concat([1e7, 2e7, 5e7, 1e8]).sort((a, b) => a - b);
export function scaleBar(height, fov, distance = FOCUS, target = 110) {
  const pxPerNm = height / 2 / Math.tan(fov * Math.PI / 360) / distance;
  const nm = BAR_STEPS.reduce((best, v) => Math.abs(v * pxPerNm - target) < Math.abs(best * pxPerNm - target) ? v : best);
  const [value, unit] = nm >= 1e7 ? [nm / 1e7, 'cm'] : nm >= 1e6 ? [nm / 1e6, 'mm'] : nm >= 1e3 ? [nm / 1e3, 'µm'] : [nm, 'nm'];
  return { nm, px: nm * pxPerNm, label: `${String(Number(value.toPrecision(3))).replace('.', ',')} ${unit}` };
}
