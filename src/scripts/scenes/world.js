/**
 * Chapter 04: the same die, new context. One scroll-driven move: the die from chapter 03 drops into
 * its package, onto a circuit board (generated traces, pads, chips, passives), then a phone-like
 * device closes around it (battery, anodised frame, display, cover glass), exploded and settling.
 * The display shows the three words of the heading: a real running calculation (Liczyć), the
 * page's own hero image building up line by line (Tworzyć), a short message exchange (Łączyć).
 * Generic and unbranded; not to scale beyond the die (docs/SCIENCE.md).
 */
import {
  BoxGeometry, CanvasTexture, MeshBasicMaterial, Color, DirectionalLight, ExtrudeGeometry, InstancedMesh, Matrix4, Mesh, MeshPhysicalMaterial,
  MeshStandardMaterial, PerspectiveCamera, PointLight, Scene, Shape, SphereGeometry, SRGBColorSpace, Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAYERS, WORDS, XRAY, activeWord, boardLayout, leibniz, placement, worldCamera } from './world-math.js';
import { createDie, boxes, boardTexture } from './parts.js';
import { scaleBar } from './lattice-math.js';
import { smoothstep } from '../story/timeline.js';

const HERO = new URL('../../assets/posters/hero-mobile.webp', import.meta.url).href;
// Chapter 06: the display shows this capture of the site's hero (npm run capture:screen).
const SITE = new URL('../../assets/posters/site-hero-screen.webp', import.meta.url).href;

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

/** The display content, drawn into a canvas (portrait, the display's aspect). Opaque: the screen is on. */
function createScreen() {
  const W = 700, H = 1480, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  // Decoded once, off the frame: drawing an undecoded image decodes it on the main thread.
  let hero = null;
  const img = new Image(); img.src = HERO;
  img.decode().then(() => createImageBitmap(img)).then(b => { hero = b; key = ''; }).catch(() => {});
  let key = '';
  const sans = 'Inter, "Segoe UI", Arial, sans-serif', mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
  const AMBER = '#e2b276', INK = '#f2eee6', DIM = '#8e959d';
  const font = (px, w = 400, f = sans) => `${w} ${px}px ${f}`;
  const wrap = (text, width) => {
    const out = [''];
    for (const w of text.split(' ')) { const t = out.at(-1) ? `${out.at(-1)} ${w}` : w; if (g.measureText(t).width > width && out.at(-1)) out.push(w); else out[out.length - 1] = t; }
    return out;
  };

  function draw(u, time) {
    const word = activeWord(u), local = word === 0 ? (u - WORDS[0]) / (WORDS[1] - WORDS[0]) : word === 1 ? (u - WORDS[1]) / (WORDS[2] - WORDS[1]) : (u - WORDS[2]) / (1 - WORDS[2]);
    // 120 terms a second, redrawn (and re-uploaded) 15 times a second.
    const n = (40 + Math.floor(time * 15) * 8) % 5000 + 1;
    const k = `${word}/${Math.round(local * 120)}/${word === 0 ? n : word === 2 ? Math.floor(time * 2) : 0}/${!!hero}`;
    if (k === key) return false;
    key = k;
    g.fillStyle = '#07090c'; g.fillRect(0, 0, W, H);
    // Status line.
    g.fillStyle = DIM; g.font = font(34, 600, mono); g.fillText('12:04', 52, 86);
    const label = ['LICZYĆ', 'TWORZYĆ', 'ŁĄCZYĆ'][word];
    g.fillStyle = AMBER; g.fillText(label, W - 52 - g.measureText(label).width, 86);
    if (word === 0) {
      // A real computation: pi from the Leibniz series; the digits that are already right in amber.
      const pi = leibniz(n), s = pi.toFixed(6), exact = Math.PI.toFixed(6);
      let ok = 0; while (ok < s.length && s[ok] === exact[ok]) ok++;
      const shown = s.replace('.', ',');
      g.fillStyle = DIM; g.font = font(36, 500, mono); g.fillText('π = 4 · (1 − ⅓ + ⅕ − …)', 52, 200);
      g.font = font(150, 700); let x = 44;
      for (let i = 0; i < shown.length; i++) { g.fillStyle = i < ok ? AMBER : INK; g.fillText(shown[i], x, 390); x += g.measureText(shown[i]).width; }
      g.fillStyle = INK; g.font = font(46, 600, mono); g.fillText(`${n.toLocaleString('pl-PL')} wyrazów`, 52, 480);
      // The partial sums converging on pi (every term up to n, log scale along x).
      const top = 580, bottom = 1360, mid = (top + bottom) / 2, sy = (bottom - top) / 2 / .6;
      g.strokeStyle = 'rgba(226,178,118,.55)'; g.lineWidth = 3; g.setLineDash([14, 12]);
      g.beginPath(); g.moveTo(52, mid); g.lineTo(W - 52, mid); g.stroke(); g.setLineDash([]);
      g.fillStyle = AMBER; g.font = font(40, 600, mono); g.fillText('π', W - 84, mid - 18);
      g.strokeStyle = INK; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath();
      let sum = 0;
      const X = k => 52 + (W - 104) * Math.log(k) / Math.log(5001);
      for (let k = 1; k <= n; k++) {
        sum += ((k - 1) % 2 ? -4 : 4) / (2 * k - 1);
        if (k > 60 && k % Math.ceil(k / 60)) continue;
        const y = Math.max(top, Math.min(bottom, mid - (sum - Math.PI) * sy));
        if (k === 1) g.moveTo(X(k), y); else g.lineTo(X(k), y);
      }
      g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(X(n), Math.max(top, Math.min(bottom, mid - (sum - Math.PI) * sy)), 12, 0, 7); g.fill();
    } else if (word === 1) {
      // The page's own hero image (the silicon chunk) resolving line by line, large on the screen.
      const p = smoothstep(.02, .85, local), rows = 80, done = Math.floor(p * rows);
      const size = W - 40, y0 = 250;
      g.fillStyle = '#0d1116'; g.fillRect(20, y0, size, size);
      if (hero) {
        const sx = hero.width * .19, sw = hero.width * .54, sy = hero.height * .54; // the chunk
        g.filter = 'brightness(1.15) contrast(1.08)';
        for (let r = 0; r < done; r++) g.drawImage(hero, sx, sy + r * sw / rows, sw, sw / rows + .5, 20, y0 + r * size / rows, size, size / rows + .6);
        g.filter = 'none';
      }
      g.fillStyle = AMBER; g.fillRect(20, y0 + done * size / rows - 2, size, 5);
      g.fillStyle = INK; g.font = font(50, 700); g.fillText('Krzem.', 52, 190);
      g.fillStyle = DIM; g.font = font(40, 500, mono); g.fillText('plakat · 1600 × 1000', 52, y0 + size + 90);
      g.fillStyle = '#1a2129'; g.fillRect(52, y0 + size + 140, W - 104, 14);
      g.fillStyle = AMBER; g.fillRect(52, y0 + size + 140, (W - 104) * p, 14);
      g.fillStyle = INK; g.font = font(46, 600, mono); g.fillText(`renderowanie ${Math.round(p * 100)}%`, 52, y0 + size + 240);
    } else {
      // A short message exchange and a signal indicator.
      const msgs = [['in', 'Jesteś już?'], ['out', 'Za 5 minut. Wysyłam zdjęcie.'], ['in', 'Widzę. Piękne światło.'], ['out', 'To ten sam kawałek krzemu.']];
      const shown = Math.max(1, Math.floor(smoothstep(0, .4, local) * msgs.length + .001));
      g.fillStyle = INK; g.font = font(50, 700); g.fillText('Ola', 52, 200);
      g.fillStyle = '#5fbf86'; g.beginPath(); g.arc(160, 184, 10, 0, 7); g.fill();
      let y = 270;
      g.font = font(52, 500);
      msgs.slice(0, shown).forEach(([dir, text]) => {
        const lines = wrap(text, W - 230), w = Math.max(...lines.map(l => g.measureText(l).width)) + 64, h = 40 + lines.length * 64, x = dir === 'in' ? 44 : W - 44 - w;
        g.fillStyle = dir === 'in' ? '#222c37' : '#a07438';
        g.beginPath(); g.roundRect(x, y, w, h, 36); g.fill();
        g.fillStyle = INK; lines.forEach((l, i) => g.fillText(l, x + 32, y + 72 + i * 64)); y += h + 34;
      });
      const bars = 1 + Math.floor(time * 2) % 4;
      for (let i = 0; i < 4; i++) { g.fillStyle = i < bars ? AMBER : '#3a4048'; g.fillRect(W - 250 + i * 24, 72 - (i + 1) * 11, 16, (i + 1) * 11); }
      g.fillStyle = '#161c23'; g.beginPath(); g.roundRect(44, H - 170, W - 88, 104, 52); g.fill();
      g.fillStyle = DIM; g.font = font(42, 500); g.fillText('Wiadomość', 88, H - 104);
    }
    tex.needsUpdate = true;
    return true;
  }
  return { texture: tex, draw, dispose: () => { tex.dispose(); hero?.close(); } };
}

export async function createWorld({ renderer, environment, dof }) {
  const scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1.5;
  scene.environmentRotation.set(Math.PI / 2, 0, -.6);
  const disposers = [];
  const own = (o, ...extra) => { disposers.push(() => { o.geometry?.dispose(); [o.material].flat().forEach(m => m?.dispose()); }, ...extra); return o; };

  const die = createDie(); scene.add(die); disposers.push(die.userData.dispose);
  // Package: laminate substrate with a gold pad ring, underfill fillet, solder balls under it.
  const pkg = new Mesh(new RoundedBoxGeometry(...LAYERS.package.size, 2, .4), new MeshStandardMaterial({ color: '#1d2a26', metalness: .3, roughness: .5 }));
  const underfill = new Mesh(new RoundedBoxGeometry(4.8, 3.8, .3, 2, .15), new MeshStandardMaterial({ color: '#202428', metalness: .1, roughness: .7 }));
  const ballGeo = new SphereGeometry(.22, 10, 8), balls = new InstancedMesh(ballGeo, new MeshStandardMaterial({ color: '#b7bcc2', metalness: 1, roughness: .25 }), 144);
  { const m = new Matrix4(); let i = 0; for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) balls.setMatrixAt(i++, m.makeTranslation(-6.05 + a * 1.1, -6.05 + b * 1.1, 0)); }
  pkg.userData.home = [0, 0, LAYERS.package.center[2]];
  underfill.position.z = -.3; scene.add(own(underfill)); // stays under the die
  balls.userData.home = [0, 0, LAYERS.package.center[2] - LAYERS.package.size[2] / 2 - .2];
  const pkgGroup = [own(pkg), own(balls)];
  // A thin amber ring around the die: the eye follows the same piece of silicon through the layers.
  // It stays with the die (not the package), fading in after chapter 03 and out before chapter 05.
  const ringShape = roundedRect(4.75, 3.75, .4); ringShape.holes.push(roundedRect(4.5, 3.5, .28));
  const ring = own(new Mesh(new ExtrudeGeometry(ringShape, { depth: .08, bevelEnabled: false, curveSegments: 6 }), new MeshStandardMaterial({ color: '#000', emissive: '#e2a65c', emissiveIntensity: 1.1, transparent: true, depthWrite: false })));
  ring.position.z = -.3;
  scene.add(ring);
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
  const battery = own(new Mesh(new RoundedBoxGeometry(...LAYERS.battery.size, 3, 1.4), new MeshStandardMaterial({ color: '#454b53', metalness: .55, roughness: .38 })));
  const alu = new MeshStandardMaterial({ color: '#b4bac1', metalness: 1, roughness: .26 });
  const f = LAYERS.frame;
  const frame = own(new Mesh(frameRing(f.size[0], f.size[1], f.radius, 1.6, f.size[2]), alu));
  const back = own(new Mesh(slab(f.size[0] - 1, f.size[1] - 1, .9, f.radius - .5, .3), new MeshStandardMaterial({ color: '#4a5058', metalness: .9, roughness: .32 })));
  back.position.z = -f.size[2] / 2 + .45;
  frame.add(back);
  const screen = createScreen();
  disposers.push(screen.dispose);
  const d = LAYERS.display;
  const display = own(new Mesh(slab(d.size[0], d.size[1], d.size[2], d.radius, .2), new MeshStandardMaterial({
    color: '#000000', emissive: '#ffffff', emissiveMap: screen.texture, transparent: true, metalness: .3, roughness: .15,
  })));
  // The extruded slab's UVs are in mm: map them onto the canvas.
  { const uv = display.geometry.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / d.size[0] + .5, uv.getY(i) / d.size[1] + .5); }
  const gl = LAYERS.glass;
  const glass = own(new Mesh(slab(gl.size[0], gl.size[1], gl.size[2], gl.radius, .3), new MeshPhysicalMaterial({
    color: '#0d1116', metalness: 0, roughness: .03, transparent: true, opacity: .2, clearcoat: 1, clearcoatRoughness: .04, depthWrite: false, envMapIntensity: 2.2,
  })));
  glass.renderOrder = 20; display.renderOrder = 19;
  const layers = { package: pkgGroup, board: [board], battery: [battery], frame: [frame], display: [display], glass: [glass] };
  for (const [name, list] of Object.entries(layers)) for (const o of list) { o.userData.home ??= LAYERS[name].center.slice(); o.position.set(...o.userData.home); scene.add(o); }

  // Product-shot light: a soft key from the camera side, a hard rim from behind along the frame
  // and glass edges, a warm fill; the lit screen spills a little light on the layers around it.
  const key = new DirectionalLight('#f1ece4', 1.7); key.position.set(-120, -80, 220);
  const rim = new DirectionalLight('#eef2f6', 3.2); rim.position.set(160, 240, 45);
  const warm = new DirectionalLight('#ffb070', .7); warm.position.set(200, -40, 50);
  const spill = new PointLight('#ffe4bf', 0, 140, 1.4);
  for (const o of [battery, frame, back]) o.material.transparent = true;
  scene.add(key, rim, warm, spill);

  const camera = new PerspectiveCamera(30, 1, .1, 4000);
  camera.up.set(0, 0, 1);
  let framing = 'desktop', size = [1, 1];
  screen.draw(.3, 0);
  const siteImage = new Image(); siteImage.src = SITE;
  await siteImage.decode();
  const site = new Texture(siteImage);
  site.colorSpace = SRGBColorSpace; site.anisotropy = 8; site.needsUpdate = true;
  disposers.push(() => site.dispose());
  renderer.initTexture(site);
  // The finale's screen is unlit: the capture exactly as the page looks (a lit, glossy screen
  // picked up the key and rim lights as a haze over the chunk the real one has to meet).
  const siteScreen = new MeshBasicMaterial({ map: site, transparent: true });
  disposers.push(() => siteScreen.dispose());
  const lcdScreen = display.material;
  display.material = siteScreen; await dof.compile(scene, camera); // both variants, before first sight
  display.material = lcdScreen;
  await dof.compile(scene, camera);
  // Upload the canvas textures now, not on the first frame that sees them (a 50-80 ms hitch).
  scene.traverse(n => [n.material].flat().forEach(m => m && Object.values(m).forEach(v => v?.isTexture && renderer.initTexture(v))));

  return {
    resize(width, height, nextFraming) { size = [width, height]; framing = nextFraming; },
    /**
     * state: { progress (chapter 04), time, opacity, finale }. Returns the scale bar (true for the
     * die plane). finale (chapter 06, finale-math.js finaleState): the camera, the device closing
     * around the chip (assemble), the display showing the site capture (screen), the glass.
     */
    render({ progress: u, time, opacity = 1, finale = null }) {
      const cam = finale?.cam ?? worldCamera(u, framing, time * 2 * Math.PI / 90);
      // In the finale the chip's board is in place and the rest arrives as in chapter 04.
      const at = name => !finale ? u : ['package', 'board', 'parts'].includes(name) ? 1 : .2 + .5 * finale.assemble;
      camera.fov = cam.fov; camera.aspect = size[0] / size[1];
      camera.near = cam.d * .02; camera.far = cam.d * 20;
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = -cam.shift[0];
      camera.projectionMatrix.elements[9] = -cam.shift[1];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(...cam.position);
      camera.lookAt(...cam.target);
      for (const [name, list] of Object.entries(layers)) {
        const pl = placement(name, at(name));
        for (const o of list) { o.visible = pl.appear > .001; o.position.set(...o.userData.home.map((v, i) => v + pl.offset[i])); }
      }
      // Parts settle onto the board one after another (seeded order).
      const pp = placement('parts', at('parts'));
      for (const p of partsGroup) { p.visible = pp.appear > .001; p.position.z = pp.offset[2]; p.scale.set(1, 1, Math.max(.001, pp.k)); }
      // The screen switches on with the first word and the device turns to a ghost at the end.
      const xray = finale ? 0 : smoothstep(XRAY[0], XRAY[1], u);
      const lit = finale ? finale.screen : smoothstep(WORDS[0] - .04, WORDS[0] + .02, u) * placement('display', u).appear * (1 - xray);
      display.material = finale ? siteScreen : lcdScreen;
      display.material.opacity = lit;
      if (!finale) display.material.emissiveIntensity = 1.5 * lit;
      // Below the screen: it lights the layers around it without a glare on the screen itself.
      spill.position.set(0, 30, display.position.z - 3); spill.intensity = finale ? 0 : 1600 * lit; // (the finale's screen is unlit)
      // (transparent from the start: switching it would build another program mid-scroll)
      for (const o of [battery, frame, back]) {
        o.material.opacity = 1 - .85 * xray; o.material.depthWrite = xray < .5;
      }
      // Fades in as it lands: a floating dark slab with its reflections read as a smear.
      glass.material.opacity = .2 * placement('glass', at('glass')).k ** 2 * (1 - .5 * xray) * (finale?.glass ?? 1);
      ring.material.opacity = finale ? 0 : smoothstep(.06, .14, u) * (1 - smoothstep(.93, 1, u));
      if (!finale) screen.draw(u, time);
      renderer.toneMappingExposure = 1;
      dof.render(scene, camera, { focus: cam.d, aperture: cam.aperture, opacity });
      return opacity > .6 && !finale ? { ...scaleBar(size[1], cam.fov, cam.d * 1e6, 90), scene: 'world' } : null;
    },
    dispose() { for (const d of disposers) d(); },
  };
}
