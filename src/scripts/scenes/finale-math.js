/**
 * Chapter 06, the finale (pure math, node-tested): the chip on its accelerator board, the phone-like
 * device of chapter 04 closing around it, its display showing a capture of this site's hero, and
 * the real silicon chunk taking over from the chunk on that screen.
 *
 * The match: at MATCH the camera looks straight at the display. The screen shows the hero as a
 * phone renders it (hero camera, mobile pose, aspect SCREEN_ASPECT), so drawing the hero scene with
 * the same camera, its frustum mapped onto the display's rectangle on screen, puts the real chunk
 * exactly over the chunk in the capture. Afterwards that rectangle eases to REST, where the chunk
 * sits in the page's composition. Lengths in mm in the device scenes (die top centre at the origin).
 */
import { clamp, smoothstep } from '../story/timeline.js';
import { cameraPath } from './scale-math.js';
import { LAYERS, dieClose } from './world-math.js';
import { aiEnd } from './ai-math.js';
import { heroPose } from '../story/camera-rig.js';

/** The display (70 x 148 mm) and the capture on it share this aspect (390 x 824 CSS px). */
export const SCREEN_ASPECT = LAYERS.display.size[0] / LAYERS.display.size[1];
/** Top surface of the display (mm): the plane the capture is drawn on. */
export const SCREEN_Z = LAYERS.display.center[2] + LAYERS.display.size[2] / 2;
/**
 * Where the chunk sits in the capture (src/assets/posters/site-hero-screen.webp), in the capture's
 * own NDC (x right, y up, -1..1): centre and height. Measured on the capture; used only to place
 * the rest frame, never for the match itself (that is exact by construction).
 */
export const CHUNK_IN_SCREEN = { c: [-.115, -.465], h: .33 };

/** Chapter progress marks. */
export const FINALE = {
  board: [.12, .2], // the accelerator board gives way to the phone board (cross-fade)
  assemble: [.12, .32], // battery, frame, display, glass close around the chip
  screen: [.24, .34], // the display lights up with the site
  glass: [.4, .5], // the cover glass clears as the camera squares up to the screen
  match: .5, // the real chunk takes over from the chunk on the screen
  dissolve: [.5, .58], // the device dissolves away
  settle: [.58, .84], // the chunk moves into its place in the page
  copy: [.82, .9], // heading, text and wordmark
};

const KEYS = [0, .16, .34, FINALE.match, .6];
const paths = {};
/** The device scenes' camera for chapter progress u (constant after .6, when the device is gone). */
export function finaleCamera(u, framing = 'desktop') {
  const m = framing === 'mobile';
  const match = matchFrame(framing);
  paths[framing] ??= cameraPath(KEYS, [
    aiEnd(framing),
    // Back to our board's chip, both boards' common frame (the cross-fade happens around here).
    { target: [0, 2, 0], d: m ? 190 : 130, az: .72, el: .82, fov: m ? 40 : 30, shift: m ? [0, -.2] : [.26, .02], aperture: .006 },
    // The device closed around it, the display lit.
    { target: [0, 30, 1], d: m ? 470 : 340, az: .4, el: 1.02, fov: m ? 40 : 30, shift: m ? [0, -.1] : [.3, 0], aperture: .004 },
    match,
    { ...match, d: match.d * .9 },
  ]);
  return paths[framing](u);
}
/** The match frame: straight down onto the display (a hair off vertical so z can stay "up"). */
export function matchFrame(framing = 'desktop') {
  const m = framing === 'mobile', fov = m ? 40 : 30, share = m ? .9 : .84;
  const d = LAYERS.display.size[1] / (share * 2 * Math.tan(fov * Math.PI / 360));
  return { target: [0, LAYERS.display.center[1], SCREEN_Z], d, az: 0, el: Math.PI / 2 - 1e-3, fov, shift: m ? [0, .02] : [.3, 0], aperture: .001 };
}

/** Perspective projection of a world point for a camera from cameraPath (z up), to NDC. */
export function projectNdc(point, cam, aspect) {
  const f = cam.target.map((v, i) => v - cam.position[i]), fl = Math.hypot(...f), fw = f.map(v => v / fl);
  const up = cam.up ?? [0, 0, 1];
  let r = [fw[1] * up[2] - fw[2] * up[1], fw[2] * up[0] - fw[0] * up[2], fw[0] * up[1] - fw[1] * up[0]];
  const rl = Math.hypot(...r); r = r.map(v => v / rl);
  const u = [r[1] * fw[2] - r[2] * fw[1], r[2] * fw[0] - r[0] * fw[2], r[0] * fw[1] - r[1] * fw[0]];
  const d = point.map((v, i) => v - cam.position[i]), z = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
  const t = Math.tan(cam.fov * Math.PI / 360);
  return [(d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z / (t * aspect) + cam.shift[0], (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z / t + cam.shift[1]];
}
/** The display's rectangle on screen in NDC: { c: [x, y], h: [half width, half height] }. */
export function screenRect(cam, aspect) {
  const [w, h] = LAYERS.display.size, [cx, cy] = LAYERS.display.center;
  const a = projectNdc([cx - w / 2, cy - h / 2, SCREEN_Z], cam, aspect), b = projectNdc([cx + w / 2, cy + h / 2, SCREEN_Z], cam, aspect);
  return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], h: [Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2] };
}
/** Where the chunk rests (NDC rectangle the hero frustum maps to), for a viewport aspect. */
export function restRect(framing, aspect) {
  const m = framing === 'mobile', target = m ? [-.08, -.27] : [.26, .08], height = m ? .5 : 1.02; // chunk centre, NDC height
  const hh = height / (2 * CHUNK_IN_SCREEN.h), hw = hh * SCREEN_ASPECT / aspect;
  return { c: [target[0] - CHUNK_IN_SCREEN.c[0] * hw, target[1] - CHUNK_IN_SCREEN.c[1] * hh], h: [hw, hh] };
}
const mixRect = (a, b, k) => ({ c: a.c.map((v, i) => v + (b.c[i] - v) * k), h: a.h.map((v, i) => v + (b.h[i] - v) * k) });

/**
 * Everything the renderer needs at chapter progress u: { cam, board (0 ai, 1 world), assemble,
 * screen, glass, device (opacity), chunk (the hero frustum's rectangle or null), theta, copy }.
 */
export function finaleState(u, framing, aspect) {
  u = clamp(u);
  const cam = finaleCamera(u, framing);
  const settle = smoothstep(...FINALE.settle, u);
  let chunk = null;
  if (u >= FINALE.match) {
    const atScreen = screenRect(finaleCamera(Math.min(u, FINALE.settle[0]), framing), aspect);
    chunk = mixRect(atScreen, restRect(framing, aspect), settle);
  }
  return {
    cam, chunk,
    board: smoothstep(...FINALE.board, u),
    assemble: smoothstep(...FINALE.assemble, u),
    screen: smoothstep(...FINALE.screen, u),
    glass: 1 - smoothstep(...FINALE.glass, u),
    device: 1 - smoothstep(...FINALE.dissolve, u),
    // The chunk turns with the scroll after the match (the capture was taken at rest, theta 0).
    theta: .45 * smoothstep(FINALE.match, 1, u),
    copy: smoothstep(...FINALE.copy, u),
  };
}

/** The hero camera the capture was taken with (the phone pose for the screen's aspect). */
export function screenHeroPose(config) { return heroPose(config, 'mobile', SCREEN_ASPECT); }
