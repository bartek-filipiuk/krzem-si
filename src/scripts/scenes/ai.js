/**
 * Chapter 05: the same die on an accelerator-style board, and the arithmetic of the DOM demo above
 * it with the true numbers (ai-math.js): the input vector, the weight matrix as a grid of cells
 * (cool to amber by value), the product row by row, pulses down into the chip and along board
 * traces, then the answer. Behind, subdued in the fog, the board is one of many. Illustrative.
 */
import {
  BoxGeometry, CanvasTexture, Color, DirectionalLight, Fog, InstancedMesh, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOARD, W, X, acceleratorLayout, aiCamera, demoProgress, fmt, forward } from './ai-math.js';
import { createDie, boxes, boardTexture } from './parts.js';
import { scaleBar } from './lattice-math.js';
import { smoothstep } from '../story/timeline.js';

const BG = new Color('#0b0e12');
const LAYER_Z = 11;

/** The computation layer: a canvas with the vector, the matrix, the product and the output. */
function createLayer() {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 1000;
  const g = c.getContext('2d');
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  const { y } = forward(), n = X.length;
  const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
  const cool = [90, 130, 170], amber = [222, 160, 92];
  const tone = (v, a) => { const k = (v + 1) / 2; return `rgba(${cool.map((ch, i) => Math.round(ch + (amber[i] - ch) * k)).join(',')},${a.toFixed(2)})`; };
  const label = (text, x, yy, size, a = 1) => {
    g.font = `600 ${size}px ${mono}`; g.lineWidth = 6; g.strokeStyle = `rgba(8,10,13,${(.7 * a).toFixed(2)})`;
    g.strokeText(text, x, yy); g.fillStyle = `rgba(255,248,236,${a.toFixed(2)})`; g.fillText(text, x, yy);
  };
  let key = '';
  function draw(open, rows, answer, calm) {
    const k = `${open}/${rows.toFixed(2)}/${answer.toFixed(2)}/${calm.toFixed(2)}`;
    if (k === key) return;
    key = k;
    g.clearRect(0, 0, c.width, c.height);
    const cell = 120, x0 = 110, y0 = 200, xo = x0 + n * cell + 40;
    g.textAlign = 'center';
    // Input vector across the top.
    X.forEach((v, j) => {
      g.fillStyle = tone(v, open ? .55 : .18); g.fillRect(x0 + j * cell + 6, 50, cell - 12, 90);
      if (open) label(fmt(v).trim(), x0 + j * cell + cell / 2, 108, 32);
    });
    label('x', 60, 108, 32, .6); label('W', 60, y0 + 3 * cell + 10, 32, .6); label('σ(Wx + b)', xo + 110, y0 - 22, 28, .6);
    // The weight matrix, row by row as the product runs.
    W.forEach((row, i) => row.forEach((w, j) => {
      const active = open ? smoothstep(i, i + 1, rows) : 0;
      g.fillStyle = tone(w, .1 + calm * .08 + active * .45); g.fillRect(x0 + j * cell + 6, y0 + i * cell + 6, cell - 12, cell - 12);
      if (active > .05) label(fmt(w).trim(), x0 + j * cell + cell / 2, y0 + i * cell + 72, 30, active);
    }));
    // Output column: sigma(row . x + b), appearing as each row completes.
    y.forEach((v, i) => {
      const done = open ? smoothstep(i + .7, i + 1, rows) : 0;
      g.fillStyle = `rgba(222,170,100,${(.12 + done * (.35 + .3 * answer)).toFixed(2)})`; g.fillRect(xo, y0 + i * cell + 6, 220, cell - 12);
      if (done > .05) label(fmt(v).trim(), xo + 110, y0 + i * cell + 74, 36, done);
    });
    tex.needsUpdate = true;
  }
  draw(false, 0, 0, 1);
  return { texture: tex, draw, aspect: c.width / c.height, dispose: () => tex.dispose() };
}

export async function createAi({ renderer, environment, dof }) {
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1.15;
  scene.environmentRotation.set(Math.PI / 2, 0, -.6);
  scene.fog = new Fog(BG, 300, 1600);
  const disposers = [];
  const own = o => { disposers.push(() => { o.geometry?.dispose(); [o.material].flat().forEach(m => m?.dispose()); }); scene.add(o); return o; };
  const L = acceleratorLayout();
  const die = createDie(); scene.add(die); disposers.push(die.userData.dispose);
  // Package: organic substrate with memory stacks beside the die, under a glass lid so the die stays visible.
  const sub = own(new Mesh(new RoundedBoxGeometry(34, 30, 1.4, 2, .4), new MeshStandardMaterial({ color: '#1d2622', metalness: .3, roughness: .5 })));
  sub.position.z = -1.0;
  own(boxes(L.memory, -.3, { color: '#24272b', metalness: .5, roughness: .3 }));
  const lid = own(new Mesh(new RoundedBoxGeometry(32, 28, .6, 2, .25), new MeshPhysicalMaterial({ color: '#0d1116', transparent: true, opacity: .16, roughness: .05, clearcoat: 1, depthWrite: false })));
  lid.position.z = 1.6; lid.renderOrder = 10;
  // The board: texture with traces, inductors and power stages, capacitors, an edge connector.
  const btex = boardTexture({ traces: L.traces, passives: L.caps, chips: L.power }, BOARD.size.slice(0, 2), { mask: '#0f1d18', px: 14 });
  const fr4 = new MeshStandardMaterial({ color: '#2a3328', roughness: .6 });
  const top = new MeshStandardMaterial({ map: btex, metalness: .35, roughness: .45 });
  const board = own(new Mesh(new BoxGeometry(...BOARD.size), [fr4, fr4, fr4, fr4, top, fr4]));
  board.position.z = -1.7 - BOARD.size[2] / 2;
  disposers.push(() => btex.dispose());
  const zb = -1.7;
  own(boxes(L.power, zb, { color: '#3a3d42', metalness: .6, roughness: .45 }));
  own(boxes(L.caps, zb, { metalness: .4, roughness: .5 }, (_, i) => (i % 3 ? '#8a7356' : '#2a2c30')));
  const fingers = Array.from({ length: BOARD.fingers }, (_, i) => ({ x: -55 + i * (110 / (BOARD.fingers - 1)), y: -BOARD.size[1] / 2 + 3, w: 1.5, h: 6, t: .05 }));
  own(boxes(fingers, zb, { color: '#d2a95f', metalness: 1, roughness: .25 }));
  // The board is one of many: rows of the same board receding in the fog.
  const rows = [];
  for (let r = 0; r < 5; r++) for (let k = 0; k < 9; k++) rows.push([(k - 4) * 150 + (r % 2) * 40, (r + 1) * 220, 0]);
  const twinMat = new MeshStandardMaterial({ map: btex, metalness: .35, roughness: .5 });
  const twins = new InstancedMesh(new BoxGeometry(BOARD.size[0], BOARD.size[1], BOARD.size[2]), twinMat, rows.length);
  const blocks = new InstancedMesh(new BoxGeometry(34, 30, 3), new MeshStandardMaterial({ color: '#2a2e33', metalness: .7, roughness: .35 }), rows.length);
  { const m = new Matrix4(); rows.forEach(([x, yy, z], i) => { twins.setMatrixAt(i, m.makeTranslation(x, yy, z - 2.5)); blocks.setMatrixAt(i, m.makeTranslation(x, yy, z)); }); }
  own(twins); own(blocks);
  // The computation layer above the chip and the pulses.
  const layer = createLayer();
  disposers.push(layer.dispose);
  const plane = own(new Mesh(new PlaneGeometry(30, 30 / layer.aspect), new MeshStandardMaterial({
    color: '#000000', emissive: '#ffffff', emissiveMap: layer.texture, map: layer.texture, transparent: true, depthWrite: false, side: 2,
  })));
  // Turned to read left to right from the chapter's camera (az about .62) and leaning towards it.
  plane.position.set(6, 10, LAYER_Z); plane.rotation.set(0, 0, -.62); plane.rotateX(.55); plane.renderOrder = 12;
  const pulseGeo = new SphereGeometry(.45, 10, 8), pulseMat = new MeshStandardMaterial({ color: '#000', emissive: '#e0a35c', emissiveIntensity: 3 });
  const lanes = L.traces.filter((_, i) => i % 9 === 0).slice(0, 14);
  const pulses = new InstancedMesh(pulseGeo, pulseMat, 6 + lanes.length * 3);
  own(pulses);

  const key = new DirectionalLight('#f1ece4', 1.5); key.position.set(-120, -60, 200);
  const warm = new DirectionalLight('#ffb070', .55); warm.position.set(200, 30, 40);
  scene.add(key, warm);
  const camera = new PerspectiveCamera(30, 1, .1, 4000);
  camera.up.set(0, 0, 1);
  let framing = 'desktop', size = [1, 1];
  await dof.compile(scene, camera);
  const m4 = new Matrix4();
  const along = (pts, k) => {
    const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    let d = k * seg.reduce((a, b) => a + b, 0);
    for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) { const t = d / (seg[i] || 1); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; } d -= seg[i]; }
    return pts.at(-1);
  };

  return {
    resize(width, height, nextFraming) { size = [width, height]; framing = nextFraming; },
    /** state: { progress (chapter 05), time, ai: { open, t } (seconds since opened), opacity }. */
    render({ progress: u, time, ai = { open: false, t: 0 }, opacity = 1 }) {
      const cam = aiCamera(u, framing, time * 2 * Math.PI / 90);
      camera.fov = cam.fov; camera.aspect = size[0] / size[1];
      camera.near = cam.d * .02; camera.far = cam.d * 30;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      scene.fog.near = Math.max(cam.d * 1.5, 200); scene.fog.far = Math.max(cam.d * 5, 900);
      const dp = ai.open ? demoProgress(ai.t) : { rows: 0, pulse: 0, answer: 0 };
      const show = smoothstep(.06, .2, u);
      layer.draw(ai.open, dp.rows, dp.answer, show);
      plane.material.opacity = show;
      plane.material.emissiveIntensity = 1.3 * show;
      // Pulses: down from the layer into the chip, then out along a few traces.
      let i = 0;
      const down = smoothstep(0, .45, dp.pulse), out = smoothstep(.35, 1, dp.pulse);
      for (let k = 0; k < 6; k++) {
        const s = dp.pulse > 0 && dp.pulse < 1 ? 1 : 0;
        pulses.setMatrixAt(i++, m4.makeScale(s, s, s).setPosition(6 * (1 - down) - 1.5 + k * .6, 10 * (1 - down), LAYER_Z * (1 - down) + .2));
      }
      for (const lane of lanes) for (let j = 0; j < 3; j++) {
        const k = Math.min(1, Math.max(0, out * 1.2 - j * .1)), s = out > 0 && out < 1 && k > 0 && k < 1 ? 1 : 0;
        const [x, y] = along(lane.pts, k);
        pulses.setMatrixAt(i++, m4.makeScale(s, s, s).setPosition(x, y, zb + .3));
      }
      pulses.instanceMatrix.needsUpdate = true;
      renderer.toneMappingExposure = 1;
      dof.render(scene, camera, { focus: cam.d, aperture: cam.aperture, opacity, farMax: 4 });
      return opacity > .6 ? { ...scaleBar(size[1], cam.fov, cam.d * 1e6, 90), scene: 'ai' } : null;
    },
    dispose() { for (const d of disposers) d(); },
  };
}
