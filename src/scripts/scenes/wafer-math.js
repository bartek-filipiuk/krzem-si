/**
 * Chapter 01's exit (pure math, node-tested): from the monocrystal's [110] channel the camera
 * pulls back and rises above a cut (001) face of the same crystal; the atoms shrink below a pixel
 * and the face resolves into the polished mirror of a 300 mm wafer, whose round edge and notch
 * come into frame. Then (the hand-over into chapter 02) the camera dives back to the wafer's
 * surface, to the transistor's first frame. Units: nm, the lattice's frame (cubic axes along
 * x, y, z; z is [001], the wafer's normal), the origin on an atom of the top layer.
 *
 * Skipped and said so on the page: the ingot is sliced and polished in between; a real wafer is
 * flat to near-atomic scale, and the atoms-to-mirror transition is a visual continuation.
 */
import { GLIDE_END, clamp, smoothstep } from '../story/timeline.js';
import { cameraPath } from './scale-math.js';
import { A, CHANNEL_DIR, CHANNEL_POINT, FOCUS, latticeCamera } from './lattice-math.js';
import { transistorCamera } from './transistor-math.js';

/** Chapter 01 progress at which the lattice glide ends and the pull-back starts. */
export const WAFER_START = GLIDE_END;
/** The cut face: the (001) plane through a full atom layer (quarter 8: the face-centred pattern). */
export const SURFACE_Z = 2 * A;
/** Spacing of the surface atoms along [110] and [1-10] (nm). */
export const SURFACE_PITCH = A / Math.SQRT2;
/** 300 mm wafer (SEMI M1): radius, thickness 775 um, the <110> notch ~1 mm deep (nm). */
export const WAFER = { radius: 150e6, thickness: 775e3, notch: 1e6 };
const DIR = [CHANNEL_DIR[0], CHANNEL_DIR[1], 0];
/** The wafer's centre: the atoms we have looked at lie 40 mm from it along +[110]. */
export const WAFER_CENTRE = [-40e6 * DIR[0], -40e6 * DIR[1], SURFACE_Z];
/** The notch points along -[110] (a <110> direction, as on a real (100) wafer), towards the camera. */
export const NOTCH_DIR = [-DIR[0], -DIR[1], 0];

/** The lattice's last frame as a cameraPath key (az/el around its target, FOCUS in front). */
export function latticeEnd(framing = 'desktop') {
  const cam = latticeCamera(1, framing, 0, 0);
  return { target: CHANNEL_POINT.map((v, i) => v + CHANNEL_DIR[i] * FOCUS), d: FOCUS, az: Math.PI / 4, el: 0, fov: cam.fov, shift: cam.shift, aperture: .02 };
}
/** The transistor's first frame (chapter 02 entry) as a key. */
function transistorStart(framing) {
  const t = transistorCamera(0, framing), d = Math.hypot(...t.position.map((v, i) => v - t.target[i]));
  const dir = t.position.map((v, i) => (v - t.target[i]) / d);
  return { target: t.target, d, az: Math.atan2(-dir[0], -dir[1]), el: Math.asin(dir[2]), fov: t.fov, shift: t.shift, aperture: .002 };
}

const PULL = [0, .18, .36, .54, .72, .88, 1];
const DIVE = [0, .55, 1];
const paths = {};
function build(framing) {
  const m = framing === 'mobile', fov = m ? 50 : 38, shift = m ? [0, -.3] : [.26, 0];
  const over = (target, d, az, el, aperture) => ({ target, d, az, el, fov, shift, aperture });
  const end = { target: WAFER_CENTRE.map((v, i) => v + NOTCH_DIR[i] * 25e6), d: m ? 950e6 : 520e6, az: Math.PI / 4 + .42, el: .58, fov: m ? 44 : 32, shift: m ? [0, -.3] : [.24, .02], aperture: .004 };
  const start = latticeEnd(framing);
  return {
    pull: cameraPath(PULL, [
      start,
      // Up out of the channel and over the cut face, looking down on its top layer.
      over([1.4, 1.1, SURFACE_Z], m ? 9 : 7, Math.PI / 4 + .2, .62, .03),
      over([1.2, .9, SURFACE_Z], m ? 34 : 26, Math.PI / 4 + .3, .78, .02),
      over([0, 0, SURFACE_Z], m ? 1400 : 1000, Math.PI / 4 + .36, .78, .012),
      over([-8e3 * DIR[0], -8e3 * DIR[1], SURFACE_Z], m ? 7e5 : 5e5, Math.PI / 4 + .4, .72, .008),
      over(WAFER_CENTRE.map((v, i) => i < 2 ? v * .5 : v), m ? 9e7 : 6e7, Math.PI / 4 + .42, .64, .006),
      end,
    ]),
    // Chapter 01 -> 02: back down to the surface, ending on the transistor's first frame.
    dive: cameraPath(DIVE, [end, { ...over([0, -46, SURFACE_Z], m ? 4e5 : 3e5, .5, .74, .006), fov: m ? 30 : 24 }, transistorStart(framing)]),
  };
}

/**
 * Chapter 01 at progress p (>= WAFER_START), or the hand-over at transition t: { cam, lattice
 * (opacity of the instanced lattice, cross-faded into the surface), cut (z above which atoms are
 * gone), wafer (opacity), transistor (opacity of chapter 02 over it) }.
 */
export function waferState({ progress = 1, transition = 0, framing = 'desktop' }) {
  paths[framing] ??= build(framing);
  const w = clamp((progress - WAFER_START) / (1 - WAFER_START));
  if (transition > 0) {
    return { cam: paths[framing].dive(transition), lattice: 0, cut: SURFACE_Z, wafer: 1, transistor: smoothstep(.82, 1, transition) };
  }
  // The atoms above the cut leave as the camera rises; the instanced lattice hands over to the
  // surface (the same top layer, drawn per pixel) while the atoms are still ~20 px apart.
  const cut = SURFACE_Z + 6 * (1 - smoothstep(0, .14, w));
  return { cam: paths[framing].pull(w), lattice: 1 - smoothstep(.27, .36, w), cut, wafer: smoothstep(.2, .3, w), transistor: 0 };
}

/** The wafer's outline (nm, in its plane): a circle with the V notch, as [x, y] around. */
export function waferOutline(segments = 720) {
  const out = [], notchAngle = Math.atan2(NOTCH_DIR[1], NOTCH_DIR[0]);
  const half = 1.3 * WAFER.notch / WAFER.radius; // the notch's angular half-width (90 deg V)
  for (let i = 0; i < segments; i++) {
    const a = notchAngle + (i / segments) * 2 * Math.PI;
    const off = Math.abs(Math.atan2(Math.sin(a - notchAngle), Math.cos(a - notchAngle)));
    const r = WAFER.radius - (off < half ? WAFER.notch * (1 - off / half) : 0);
    out.push([WAFER_CENTRE[0] + Math.cos(a) * r, WAFER_CENTRE[1] + Math.sin(a) * r]);
  }
  return out;
}
