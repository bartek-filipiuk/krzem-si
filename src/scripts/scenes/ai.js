/**
 * Chapter 05: the same die on an accelerator-style board, and the arithmetic of the DOM demo above
 * it with the true numbers (ai-math.js): the input vector, the weight matrix as a grid of cells
 * (cool to amber by value), the product row by row, pulses down into the chip and along board
 * traces, then the answer. Behind, subdued in the fog, the board is one of many. Illustrative.
 */
import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, DirectionalLight, Float32BufferAttribute, Fog, InstancedMesh, LineBasicMaterial, LineSegments,
  Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOARD, W, X, acceleratorLayout, aiCamera, demoProgress, fmt, forward, pulseLanes } from './ai-math.js';
import { createDie, boxes, boardTexture } from './parts.js';
import { scaleBar } from './lattice-math.js';
import { smoothstep } from '../story/timeline.js';

const BG = new Color('#0b0e12');
const LAYER_Z = 15;

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
  const btex = boardTexture({ traces: L.traces, passives: L.caps, chips: L.power }, BOARD.size.slice(0, 2), { mask: '#0f1d18', copper: '#7d6748', px: 14 });
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
  const plane = own(new Mesh(new PlaneGeometry(26, 26 / layer.aspect), new MeshStandardMaterial({
    color: '#000000', emissive: '#ffffff', emissiveMap: layer.texture, map: layer.texture, transparent: true, depthWrite: false, side: 2,
  })));
  // Behind and above the die as seen, so both show; turned and tilted to face the camera.
  plane.position.set(3, 10, LAYER_Z); plane.rotation.set(0, 0, -.62); plane.rotateX(.85); plane.renderOrder = 12;
  plane.updateMatrixWorld();
  // Threads from the bottom row of the weight matrix down to the die, and a pulse on each.
  const cellAt = (px, py) => plane.localToWorld(new Vector3((px / 1280 - .5) * 26, (.5 - py / 1000) * 26 / layer.aspect, 0));
  const threadEnds = X.map((_, j) => [cellAt(170 + j * 120, 920), new Vector3(-1.5 + j * .6, -.3 + (j % 2) * .6, .02)]);
  const threads = own(new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(threadEnds.flatMap(([a, b]) => [...a.toArray(), ...b.toArray()]), 3)),
    new LineBasicMaterial({ color: '#e0a35c', transparent: true, opacity: 0, depthWrite: false })));
  threads.renderOrder = 11;
  const pulseGeo = new SphereGeometry(.32, 10, 8), pulseMat = new MeshStandardMaterial({ color: '#000', emissive: '#ffbf75', emissiveIntensity: 4 });
  const pulses = own(new InstancedMesh(pulseGeo, pulseMat, threadEnds.length));
  // Lit lanes from the die to the memory packages and to the edge connector: a bright head runs
  // along each lane during the hardware stage and leaves it glowing.
  const lanePos = [], laneAlong = [];
  for (const pts of pulseLanes()) {
    const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    const total = seg.reduce((a, b) => a + b, 0);
    let acc = 0;
    seg.forEach((len, i) => {
      const [a, b] = [pts[i], pts[i + 1]];
      if (len < 1e-6) return; // the step down at the substrate edge
      const nx = -(b[1] - a[1]) / len * .26, ny = (b[0] - a[0]) / len * .26, t0 = acc / total, t1 = (acc + len) / total;
      const q = [[a[0] + nx, a[1] + ny, a[2] + .03, t0], [a[0] - nx, a[1] - ny, a[2] + .03, t0], [b[0] + nx, b[1] + ny, b[2] + .03, t1], [b[0] - nx, b[1] - ny, b[2] + .03, t1]];
      for (const v of [q[0], q[1], q[2], q[2], q[1], q[3]]) { lanePos.push(v[0], v[1], v[2]); laneAlong.push(v[3]); }
      acc += len;
    });
  }
  const laneMat = new ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uRest: { value: 0 }, uShow: { value: 0 } }, transparent: true, depthWrite: false, side: 2,
    vertexShader: 'attribute float along; varying float vA; void main() { vA = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uHead, uRest, uShow; varying float vA;
      void main() {
        float behind = step(vA, uHead), head = exp(-pow((uHead - vA) / .05, 2.0)) * behind;
        float k = (behind * uRest + head * 3.0) * uShow;
        if (k < .01) discard;
        gl_FragColor = vec4(vec3(1.0, .64, .3) * k, min(1.0, k));
      }`,
  });
  const lanes = own(new Mesh(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(lanePos, 3)).setAttribute('along', new Float32BufferAttribute(laneAlong, 1)), laneMat));
  lanes.renderOrder = 9;
  // Status lights on the boards in the rows: a few amber points, restrained.
  const leds = new InstancedMesh(new BoxGeometry(1.6, 1.6, .5), new MeshStandardMaterial({ color: '#000', emissive: '#f0a85a', emissiveIntensity: 3 }), rows.length * 2);
  { const m = new Matrix4(); rows.forEach(([x, yy], i) => { leds.setMatrixAt(2 * i, m.makeTranslation(x + 58, yy + 50, -1.4)); leds.setMatrixAt(2 * i + 1, m.makeTranslation(x + 54, yy + 50, -1.4)); }); }
  own(leds);

  const key = new DirectionalLight('#f1ece4', 1.5); key.position.set(-120, -60, 200);
  const warm = new DirectionalLight('#ffb070', .55); warm.position.set(200, 30, 40);
  // A rim from the far side catches the lids of the packages in the rows.
  const rim = new DirectionalLight('#dfe7ef', 2.4); rim.position.set(-80, 600, 90);
  scene.add(key, warm, rim);
  const camera = new PerspectiveCamera(30, 1, .1, 4000);
  camera.up.set(0, 0, 1);
  let framing = 'desktop', size = [1, 1];
  await dof.compile(scene, camera);
  // Upload the canvas textures now, not on the first frame that sees them (a 50-80 ms hitch).
  scene.traverse(n => [n.material].flat().forEach(m => m && Object.values(m).forEach(v => v?.isTexture && renderer.initTexture(v))));
  const m4 = new Matrix4();

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
      // Threads light with the operations; pulses run down them into the chip, then out along the lanes.
      const down = smoothstep(0, .35, dp.pulse), out = smoothstep(.3, 1, dp.pulse);
      threads.material.opacity = show * (ai.open ? .2 + .5 * smoothstep(0, 6, dp.rows) * (1 - .5 * out) : .12);
      threadEnds.forEach(([a, b], j) => {
        const k = Math.min(1, Math.max(0, down * 1.15 - j * .03)), s = dp.pulse > 0 && k < 1 && show > .5 ? 1 : 0;
        pulses.setMatrixAt(j, m4.makeScale(s, s, s).setPosition(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k));
      });
      // Like the layer, all of it waits until the camera has left the die close-up (chapter 04's end).
      laneMat.uniforms.uShow.value = show;
      laneMat.uniforms.uHead.value = out * 1.15;
      laneMat.uniforms.uRest.value = 1.1 * smoothstep(0, .25, out);
      pulses.instanceMatrix.needsUpdate = true;
      renderer.toneMappingExposure = 1;
      dof.render(scene, camera, { focus: cam.d, aperture: cam.aperture, opacity, farMax: 4 });
      return opacity > .6 ? { ...scaleBar(size[1], cam.fov, cam.d * 1e6, 90), scene: 'ai' } : null;
    },
    dispose() { for (const d of disposers) d(); },
  };
}
