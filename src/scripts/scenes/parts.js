/**
 * Shared pieces for the device scenes (chapters 04 and 05): the die as a textured object (the
 * same floorplan as chapter 03's die surface), instanced boxes for small parts, and a circuit
 * board texture drawn from a layout. Units: mm.
 */
import {
  BoxGeometry, CanvasTexture, Color, InstancedMesh, LinearMipmapLinearFilter, Matrix4, Mesh, MeshStandardMaterial, SRGBColorSpace,
} from 'three';
import { DIE, floorplan } from './scale-math.js';
import { DIE_MM } from './world-math.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function texture(c, anisotropy = 8) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = anisotropy;
  return t;
}

/** The die: dark silicon body, its top drawn from the chapter 03 floorplan (blocks, seal ring, pads). */
export function createDie() {
  const W = 1024, H = 768, [c, g] = canvas(W, H);
  const sx = W / (DIE.x[1] - DIE.x[0]), sy = H / (DIE.y[1] - DIE.y[0]);
  g.fillStyle = '#16191d'; g.fillRect(0, 0, W, H);
  const rand = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  for (const [x0, y0, x1, y1, kind] of floorplan()) {
    const X = (x0 - DIE.x[0]) * sx, Y = H - (y1 - DIE.y[0]) * sy, w = (x1 - x0) * sx, h = (y1 - y0) * sy;
    if (kind === 1) { // memory arrays: a fine regular grid
      g.fillStyle = '#2a2f36'; g.fillRect(X, Y, w, h);
      g.strokeStyle = '#3d444d'; g.lineWidth = 1;
      for (let i = X + 4; i < X + w; i += 7) { g.beginPath(); g.moveTo(i, Y); g.lineTo(i, Y + h); g.stroke(); }
      for (let j = Y + 4; j < Y + h; j += 12) { g.beginPath(); g.moveTo(X, j); g.lineTo(X + w, j); g.stroke(); }
    } else if (kind === 2) { // analog / IO: a few large devices
      g.fillStyle = '#211f1e'; g.fillRect(X, Y, w, h);
      g.fillStyle = '#34312d';
      for (let i = X + 6; i < X + w - 18; i += 26) for (let j = Y + 6; j < Y + h - 14; j += 20) g.fillRect(i, j, 18, 12);
    } else { // logic: cell rows with a random tone
      g.fillStyle = '#1d2024'; g.fillRect(X, Y, w, h);
      for (let j = Y; j < Y + h; j += 3) { g.fillStyle = `rgba(160,150,140,${(.03 + rand() * .06).toFixed(3)})`; g.fillRect(X, j, w, 2); }
    }
  }
  // Seal ring and pads.
  g.strokeStyle = '#8d939a'; g.lineWidth = 3; g.strokeRect(6, 6, W - 12, H - 12); g.strokeRect(12, 12, W - 24, H - 24);
  g.fillStyle = '#b6987a';
  for (let i = 40; i < W - 30; i += 30) { g.fillRect(i, 20, 16, 16); g.fillRect(i, H - 36, 16, 16); }
  for (let j = 50; j < H - 40; j += 30) { g.fillRect(20, j, 16, 16); g.fillRect(W - 36, j, 16, 16); }
  const top = texture(c);
  const side = new MeshStandardMaterial({ color: '#4a5058', metalness: .6, roughness: .4 });
  const face = new MeshStandardMaterial({ map: top, metalness: .55, roughness: .32 });
  const die = new Mesh(new BoxGeometry(DIE_MM.w, DIE_MM.h, DIE_MM.t), [side, side, side, side, face, side]);
  die.position.z = -DIE_MM.t / 2;
  die.userData.dispose = () => { die.geometry.dispose(); side.dispose(); face.dispose(); top.dispose(); };
  return die;
}

/** Many boxes { x, y, w, h, t } on a surface at z0, one instanced mesh, per-instance colour. */
export function boxes(list, z0, params, colors = null) {
  const material = new MeshStandardMaterial(params);
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, Math.max(1, list.length));
  const m = new Matrix4(), col = new Color();
  list.forEach((b, i) => {
    mesh.setMatrixAt(i, m.makeScale(b.w, b.h, b.t).setPosition(b.x, b.y, z0 + b.t / 2));
    if (colors) mesh.setColorAt(i, col.set(colors(b, i)));
  });
  mesh.count = list.length;
  mesh.userData.dispose = () => { mesh.geometry.dispose(); material.dispose(); };
  return mesh;
}

/** A circuit board texture: solder mask, copper traces, pads, a silkscreen grid. */
export function boardTexture(layout, size, { mask = '#10251f', copper = '#b99460', px = 18 } = {}) {
  const W = Math.round(size[0] * px), H = Math.round(size[1] * px), [c, g] = canvas(W, H);
  const X = x => (x + size[0] / 2) * px, Y = y => H - (y + size[1] / 2) * px;
  g.fillStyle = mask; g.fillRect(0, 0, W, H);
  // Faint inner-layer planes showing through the mask.
  g.fillStyle = 'rgba(255,255,255,.025)';
  for (let i = 0; i < 9; i++) g.fillRect(((i * 37) % 11) / 11 * W, ((i * 53) % 13) / 13 * H, W / 4, H / 5);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const t of layout.traces ?? []) {
    g.strokeStyle = copper; g.globalAlpha = .55; g.lineWidth = t.w * px;
    g.beginPath(); t.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke();
    g.globalAlpha = .9; g.fillStyle = copper;
    const [ex, ey] = t.pts.at(-1); g.beginPath(); g.arc(X(ex), Y(ey), t.w * px * 1.4, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  // Pads under the parts.
  g.fillStyle = '#c9b089';
  for (const p of layout.passives ?? []) {
    const long = p.w > p.h;
    for (const s of [-1, 1]) g.fillRect(X(p.x + (long ? s * p.w * .42 : 0)) - (long ? p.w * .2 : p.w * .6) * px, Y(p.y + (long ? 0 : s * p.h * .42)) - (long ? p.h * .6 : p.h * .2) * px, (long ? p.w * .4 : p.w * 1.2) * px, (long ? p.h * 1.2 : p.h * .4) * px);
  }
  // Silkscreen outlines around chips.
  g.strokeStyle = 'rgba(220,225,230,.35)'; g.lineWidth = Math.max(1, .12 * px);
  for (const ch of layout.chips ?? []) g.strokeRect(X(ch.x - ch.w / 2 - .6), Y(ch.y + ch.h / 2 + .6), (ch.w + 1.2) * px, (ch.h + 1.2) * px);
  return texture(c);
}
