/**
 * Camera rig for the hero and the entry into the material. Pure math on [x, y, z] arrays, no
 * Three.js, so it runs under node:test. The pose is a function of (s, theta, framing, parallax):
 * s is the entry progress from the story timeline, theta the chunk's ambient rotation.
 *
 * The approach is built in the chunk's local frame and rotated back to world space, so the
 * entry face stays under the camera while the chunk keeps turning. At s = 0 the pose equals
 * the Blender hero camera exactly (poster match); at s = 1 the camera sits on the face normal.
 */
import { clamp, smoothstep } from './timeline.js';

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, k) => a.map(v => v * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = a => Math.hypot(...a);
export const normalize = a => { const l = length(a) || 1; return scale(a, 1 / l); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const rotateY = ([x, y, z], a) => { const c = Math.cos(a), s = Math.sin(a); return [c * x + s * z, y, -s * x + c * z]; };
/** Rotate v around the unit axis k (Rodrigues). */
function rotateAxis(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

export const PARALLAX_DEG = 2;
/** Distance from the entry face at s = 1, in metres (chunk longest side = 1 m). */
export const END_DISTANCE = .26;

/**
 * Framing is layout, never quality. The camera variant follows the same width rule as the
 * poster's <source media="(max-width: 759px)">, so the handover compares like with like.
 * A short screen additionally gets the compact layout (CSS), not a lower tier.
 */
export function framingFor(width) { return width >= 760 ? 'desktop' : 'mobile'; }
export function isCompact(width, height) { return width >= 760 ? height < 560 : height < 740; }

/**
 * Hero pose for a framing, with the vertical FOV adjusted so the canvas crops exactly like the
 * poster's `object-fit: cover` at any viewport aspect.
 */
export function heroPose(config, framing, aspect) {
  const variant = config[framing] ?? {};
  const base = { fov: config.fov, position: config.position, target: config.target, ...variant };
  const posterAspect = variant.aspect ?? (framing === 'desktop' ? 1600 / 1000 : 900 / 1400);
  let fov = base.fov;
  if (aspect > posterAspect) {
    // Cover crops top/bottom here: keep the poster's horizontal extent instead of its vertical.
    fov = Math.atan(Math.tan(fov * Math.PI / 360) * posterAspect / aspect) * 360 / Math.PI;
  }
  return { fov, position: base.position, target: base.target };
}

/**
 * Camera pose along the entry. Channels:
 *  - orbit: the viewing direction (seen from the orbit centre) turns from the hero direction to
 *    the face normal. A sideways bias keeps it defined when the face points away from the camera
 *    (the camera then swings around the chunk instead of passing through it).
 *  - centre: the orbit centre slides from the hero target to the face point.
 *  - radius: dollies from the hero distance down to END_DISTANCE, mostly late in the move.
 * Parallax (yaw, pitch in [-.5, .5]) orbits the camera by at most PARALLAX_DEG around its target
 * and fades out as the camera commits to the face.
 */
export function cameraPose({ s = 0, theta = 0, hero, face, parallax = [0, 0] }) {
  s = clamp(s);
  const heroPos = rotateY(hero.position, -theta), heroTarget = rotateY(hero.target, -theta);
  const n = normalize(face.approach ?? face.normal);
  const d0 = normalize(sub(heroPos, heroTarget)), r0 = length(sub(heroPos, heroTarget));
  const orbit = smoothstep(0, .62, s), slide = smoothstep(.08, .92, s), dolly = smoothstep(.2, 1, s);
  // The further the face points away (w: 0 facing the camera, 1 opposite), the higher the camera
  // cranes: an antipodal face is reached over the top. Only vector ops, no branch on the side,
  // so the pose is continuous in theta (a left/right choice would flip somewhere on the circle).
  const w = (1 - dot(d0, n)) / 2;
  let direction = add(mix(d0, n, orbit), [0, 4 * w * w * orbit * (1 - orbit), 0]);
  direction = length(direction) < 1e-6 ? d0 : normalize(direction);
  const centre = mix(heroTarget, face.point, slide);
  const radius = r0 + (END_DISTANCE - r0) * dolly;
  let position = add(centre, scale(direction, radius));
  let target = centre;
  position = rotateY(position, theta); target = rotateY(target, theta);

  const weight = 1 - smoothstep(0, .35, s);
  if (weight > 0 && (parallax[0] || parallax[1])) {
    const max = PARALLAX_DEG * Math.PI / 180 * weight;
    const offset = sub(position, target);
    const yawed = rotateAxis(offset, [0, 1, 0], -clamp(parallax[0], -.5, .5) * 2 * max);
    const right = normalize(cross([0, 1, 0], yawed));
    position = add(target, rotateAxis(yawed, right, -clamp(parallax[1], -.5, .5) * 2 * max * .75));
  }
  return { position, target, fov: hero.fov };
}
