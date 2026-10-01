/**
 * Chapter 04: the same die, new context. One scroll-driven move: the die from chapter 03 drops into
 * its package, onto a circuit board (generated traces, pads, chips, passives), then a phone-like
 * device closes around it (battery, anodised frame, display, cover glass), exploded and settling.
 * The display shows the three words of the heading: a real running calculation (Liczyć), the
 * page's own hero image building up line by line (Tworzyć), a short message exchange (Łączyć).
 * Generic and unbranded; not to scale beyond the die (docs/SCIENCE.md).
 */
import {
  BoxGeometry, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, InstancedMesh, Matrix4, Mesh, MeshPhysicalMaterial,
  MeshStandardMaterial, PerspectiveCamera, Scene, Shape, SphereGeometry, SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAYERS, WORDS, activeWord, boardLayout, leibniz, placement, worldCamera } from './world-math.js';
import { createDie, boxes, boardTexture } from './parts.js';
import { scaleBar } from './lattice-math.js';
import { smoothstep } from '../story/timeline.js';

const HERO = new URL('../../assets/posters/hero-mobile.webp', import.meta.url).href;

/** A rounded rectangle outline (mm) as a three.js Shape. */
function roundedRect(w, h, r, shape = new Shape()) {
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}
function slab(w, h, t, r, bevel = .5) {
  const g = new ExtrudeGeometry(roundedRect(w - 2 * bevel, h - 2 * bevel, Math.max(.1, r - bevel)), { depth: t - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -t / 2 + bevel);
  return g;
}
function frameRing(w, h, r, wall, t) {
  const outer = roundedRect(w, h, r), inner = roundedRect(w - 2 * wall, h - 2 * wall, r - wall);
  outer.holes.push(inner);
  const g = new ExtrudeGeometry(outer, { depth: t, bevelEnabled: true, bevelThickness: .5, bevelSize: .5, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -t / 2);
  return g;
}

/** The display content, drawn into a canvas (portrait, the display's aspect). */
function createScreen() {
  const W = 700, H = 1480, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  const hero = new Image(); hero.decoding = 'async'; hero.src = HERO;
  let key = '';
  const font = (px, w = 400, f = 'Inter, "Segoe UI", Arial, sans-serif') => `${w} ${px}px ${f}`;
  const serif = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
  // The lower third stays a dark window: the die below shows through the glass there.
  const CONTENT = H * .64;

  function draw(u, time) {
    const word = activeWord(u), local = word === 0 ? (u - WORDS[0]) / (WORDS[1] - WORDS[0]) : word === 1 ? (u - WORDS[1]) / (WORDS[2] - WORDS[1]) : (u - WORDS[2]) / (1 - WORDS[2]);
    // 120 terms a second, redrawn (and re-uploaded) 15 times a second.
    const n = (40 + Math.floor(time * 15) * 8) % 5000 + 1;
    const k = `${word}/${Math.round(local * 200)}/${word === 0 ? n : word === 2 ? Math.floor(time * 2) : 0}/${hero.complete}`;
    if (k === key) return false;
    key = k;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(9,12,16,.97)'; g.fillRect(0, 0, W, CONTENT);
    const fade = g.createLinearGradient(0, CONTENT - 120, 0, CONTENT + 40);
    fade.addColorStop(0, 'rgba(9,12,16,0)'); fade.addColorStop(1, 'rgba(9,12,16,.97)');
    g.fillStyle = 'rgba(9,12,16,.22)'; g.fillRect(0, CONTENT, W, H - CONTENT);
    // Status line.
    g.fillStyle = '#7f8790'; g.font = font(33, 500, mono); g.fillText('12:04', 48, 80);
    g.fillStyle = '#d0ad79'; g.fillText(['LICZYĆ', 'TWORZYĆ', 'ŁĄCZYĆ'][word], W - 48 - g.measureText(['LICZYĆ', 'TWORZYĆ', 'ŁĄCZYĆ'][word]).width, 80);
    if (word === 0) {
      // A real computation: pi from the Leibniz series, the digits that are already right in amber.
      const pi = leibniz(n), s = pi.toFixed(8), exact = Math.PI.toFixed(8);
      let ok = 0; while (ok < s.length && s[ok] === exact[ok]) ok++;
      g.fillStyle = '#7f8790'; g.font = font(39, 500, mono); g.fillText('π = 4·(1 − 1/3 + 1/5 − …)', 48, 190);
      g.font = font(180, 400, serif); g.fillStyle = '#d0ad79'; g.fillText(s.slice(0, ok), 40, 400);
      g.fillStyle = '#eeeae2'; g.fillText(s.slice(ok), 40 + g.measureText(s.slice(0, ok)).width, 400);
      g.font = font(42, 500, mono); g.fillStyle = '#a3a6ab'; g.fillText(`n = ${n.toLocaleString('pl-PL')} wyrazów`, 48, 480);
      // The last partial sums, converging.
      for (let i = 0; i < 6; i++) {
        const m = Math.max(1, n - i * 3), v = leibniz(m);
        g.fillStyle = `rgba(200,205,210,${(.85 - i * .08).toFixed(2)})`; g.font = font(39, 400, mono);
        g.fillText(`${String(m).padStart(5, ' ')}  ${v.toFixed(8)}`, 48, 580 + i * 56);
      }
    } else if (word === 1) {
      // The hero image builds up line by line (the page's own poster).
      if (hero.complete && hero.naturalWidth) {
        // The chunk sits in the lower half of the portrait poster: build up that crop.
        const rows = Math.floor(smoothstep(.02, .9, local) * 64);
        const y0 = hero.naturalHeight * .4, x0 = hero.naturalWidth * .05, sw = hero.naturalWidth * .9;
        const sh = (hero.naturalHeight * .58) / 64, dh = (CONTENT - 160) / 64;
        for (let r = 0; r < rows; r++) g.drawImage(hero, x0, y0 + r * sh, sw, sh, 24, 110 + r * dh, W - 48, dh + .6);
        g.fillStyle = '#d0ad79'; g.fillRect(40, 100 + rows * dh, W - 80, 2);
      }
      g.fillStyle = '#a3a6ab'; g.font = font(36, 500, mono); g.fillText(`renderowanie · ${Math.round(smoothstep(.02, .9, local) * 100)}%`, 48, CONTENT - 20);
    } else {
      // A short message exchange and a signal indicator.
      const msgs = [['in', 'Jesteś już?'], ['out', 'Za 5 minut. Wysyłam zdjęcie.'], ['in', 'Widzę. Piękne światło.'], ['out', 'To ten sam kawałek krzemu.']];
      const shown = Math.floor(smoothstep(.02, .8, local) * msgs.length + .001);
      let y = 140;
      g.font = font(45, 400);
      msgs.slice(0, Math.max(1, shown)).forEach(([dir, text]) => {
        const w = Math.min(W - 96, g.measureText(text).width + 56), x = dir === 'in' ? 48 : W - 48 - w;
        g.fillStyle = dir === 'in' ? '#1f2833' : '#5a4630';
        g.beginPath(); g.roundRect(x, y, w, 96, 30); g.fill();
        g.fillStyle = '#eeeae2'; g.fillText(text, x + 28, y + 62); y += 124;
      });
      const bars = 1 + Math.floor(time * 2) % 4;
      for (let i = 0; i < 4; i++) { g.fillStyle = i < bars ? '#d0ad79' : '#3a4048'; g.fillRect(W - 140 + i * 22, 112 - (i + 1) * 10, 14, (i + 1) * 10); }
    }
    tex.needsUpdate = true;
    return true;
  }
  return { texture: tex, draw, dispose: () => tex.dispose() };
}

export async function createWorld({ renderer, environment, dof }) {
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1.2;
  scene.environmentRotation.set(Math.PI / 2, 0, -.6);
  const disposers = [];
  const own = (o, ...extra) => { disposers.push(() => { o.geometry?.dispose(); [o.material].flat().forEach(m => m?.dispose()); }, ...extra); return o; };

  const die = createDie(); scene.add(die); disposers.push(die.userData.dispose);
  // Package: laminate substrate with a gold pad ring, underfill fillet, solder balls under it.
  const pkg = new Mesh(new RoundedBoxGeometry(...LAYERS.package.size, 2, .4), new MeshStandardMaterial({ color: '#1d2a26', metalness: .3, roughness: .5 }));
  const underfill = new Mesh(new RoundedBoxGeometry(4.8, 3.8, .3, 2, .15), new MeshStandardMaterial({ color: '#3a3f44', metalness: .1, roughness: .7 }));
  const ballGeo = new SphereGeometry(.22, 10, 8), balls = new InstancedMesh(ballGeo, new MeshStandardMaterial({ color: '#b7bcc2', metalness: 1, roughness: .25 }), 144);
  { const m = new Matrix4(); let i = 0; for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) balls.setMatrixAt(i++, m.makeTranslation(-6.05 + a * 1.1, -6.05 + b * 1.1, 0)); }
  pkg.userData.home = [0, 0, LAYERS.package.center[2]];
  underfill.userData.home = [0, 0, -.3];
  balls.userData.home = [0, 0, LAYERS.package.center[2] - LAYERS.package.size[2] / 2 - .2];
  const pkgGroup = [own(pkg), own(underfill), own(balls)];
  pkgGroup.forEach(o => scene.add(o));

  // Board with its texture, chips and passives.
  const layout = boardLayout();
  const boardTex = boardTexture(layout, LAYERS.board.size);
  const fr4 = new MeshStandardMaterial({ color: '#2f3a2c', metalness: .1, roughness: .6 });
  const top = new MeshStandardMaterial({ map: boardTex, metalness: .35, roughness: .45 });
  const board = new Mesh(new BoxGeometry(...LAYERS.board.size), [fr4, fr4, fr4, fr4, top, fr4]);
  scene.add(own(board, () => boardTex.dispose()));
  const zTop = LAYERS.board.size[2] / 2;
  const chips = own(boxes(layout.chips.map(c => ({ ...c })), zTop, { color: '#16181b', metalness: .4, roughness: .35 }));
  const passives = own(boxes(layout.passives, zTop, { metalness: .5, roughness: .45 }, p => p.kind === 'cap' ? '#8c7458' : '#26282c'));
  const partsGroup = [chips, passives];
  for (const p of partsGroup) board.add(p);
  // Battery, frame (with its back), display, cover glass.
  const battery = own(new Mesh(new RoundedBoxGeometry(...LAYERS.battery.size, 3, 1.4), new MeshStandardMaterial({ color: '#2b2f35', metalness: .25, roughness: .55 })));
  const alu = new MeshStandardMaterial({ color: '#8d949c', metalness: .9, roughness: .34 });
  const f = LAYERS.frame;
  const frame = own(new Mesh(frameRing(f.size[0], f.size[1], f.radius, 1.6, f.size[2]), alu));
  const back = own(new Mesh(slab(f.size[0] - 1, f.size[1] - 1, .9, f.radius - .5, .3), new MeshStandardMaterial({ color: '#3c4148', metalness: .85, roughness: .4 })));
  back.position.z = -f.size[2] / 2 + .45;
  frame.add(back);
  const screen = createScreen();
  disposers.push(screen.dispose);
  const d = LAYERS.display;
  const display = own(new Mesh(slab(d.size[0], d.size[1], d.size[2], d.radius, .2), new MeshStandardMaterial({
    color: '#000000', emissive: '#ffffff', emissiveMap: screen.texture, map: screen.texture, transparent: true, depthWrite: false, metalness: .2, roughness: .2,
  })));
  // The extruded slab's UVs are in mm: map them onto the canvas.
  { const uv = display.geometry.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / d.size[0] + .5, uv.getY(i) / d.size[1] + .5); }
  const gl = LAYERS.glass;
  const glass = own(new Mesh(slab(gl.size[0], gl.size[1], gl.size[2], gl.radius, .3), new MeshPhysicalMaterial({
    color: '#0d1116', metalness: 0, roughness: .04, transparent: true, opacity: .22, clearcoat: 1, clearcoatRoughness: .05, depthWrite: false, envMapIntensity: 1.4,
  })));
  glass.renderOrder = 20; display.renderOrder = 19;
  const layers = { package: pkgGroup, board: [board], battery: [battery], frame: [frame], display: [display], glass: [glass] };
  for (const [name, list] of Object.entries(layers)) for (const o of list) { o.userData.home ??= LAYERS[name].center.slice(); o.position.set(...o.userData.home); scene.add(o); }

  const key = new DirectionalLight('#f1ece4', 1.6); key.position.set(-120, -80, 220);
  const warm = new DirectionalLight('#ffb070', .6); warm.position.set(200, 40, 50);
  scene.add(key, warm);

  const camera = new PerspectiveCamera(30, 1, .1, 4000);
  camera.up.set(0, 0, 1);
  let framing = 'desktop', size = [1, 1];
  screen.draw(.3, 0);
  await dof.compile(scene, camera);
  // Upload the canvas textures now, not on the first frame that sees them (a 50-80 ms hitch).
  scene.traverse(n => [n.material].flat().forEach(m => m && Object.values(m).forEach(v => v?.isTexture && renderer.initTexture(v))));

  return {
    resize(width, height, nextFraming) { size = [width, height]; framing = nextFraming; },
    /** state: { progress (chapter 04), time, opacity }. Returns the scale bar (true for the die plane). */
    render({ progress: u, time, opacity = 1 }) {
      const cam = worldCamera(u, framing, time * 2 * Math.PI / 90);
      camera.fov = cam.fov; camera.aspect = size[0] / size[1];
      camera.near = cam.d * .02; camera.far = cam.d * 20;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      for (const [name, list] of Object.entries(layers)) {
        const pl = placement(name, u);
        for (const o of list) { o.visible = pl.appear > .001; o.position.set(...o.userData.home.map((v, i) => v + pl.offset[i])); }
      }
      // Parts settle onto the board one after another (seeded order).
      const pp = placement('parts', u);
      for (const p of partsGroup) { p.visible = pp.appear > .001; p.position.z = pp.offset[2]; p.scale.set(1, 1, Math.max(.001, pp.k)); }
      const lit = smoothstep(WORDS[0], WORDS[0] + .06, u) * placement('display', u).appear;
      display.material.opacity = lit;
      display.material.emissiveIntensity = 1.7 * lit;
      screen.draw(u, time);
      renderer.toneMappingExposure = 1;
      dof.render(scene, camera, { focus: cam.d, aperture: cam.aperture, opacity });
      return opacity > .6 ? { ...scaleBar(size[1], cam.fov, cam.d * 1e6, 90), scene: 'world' } : null;
    },
    dispose() { for (const d of disposers) d(); },
  };
}
