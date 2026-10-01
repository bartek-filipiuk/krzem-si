/**
 * GPU layer, imported lazily by the text layer (never in the calm profile). One canvas, one
 * WebGL 2 context, one WebGLRenderer. The text layer owns the only requestAnimationFrame loop
 * and calls frame(state) from it; this module never schedules frames itself.
 */
import { WebGLRenderer } from 'three';
import { createAssetManager } from './assets.js';
import { PROFILES, pixelRatio, textureSet } from './quality.js';
import { entryPhases, latticeProgress, smoothstep } from '../story/timeline.js';
import { createHero } from '../scenes/hero.js';
import { createLegacyScenes } from '../scenes/legacy.js';
import { createLattice } from '../scenes/lattice.js';
import { createTransistor } from '../scenes/transistor.js';

export async function createGpuLayer({ canvas, profile, framing, signal, invalidate, gpuTimer = false }) {
  const settings = PROFILES[profile];
  // Throws when WebGL 2 is unavailable; the caller falls back to posters.
  const renderer = new WebGLRenderer({ canvas, antialias: settings.antialias, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const assets = createAssetManager();
  const timer = gpuTimer ? createGpuTimer(renderer.getContext()) : null; // QA/debug only
  let hero = null, lattice = null, transistor = null, legacy = null, scale = null, current = { profile, framing, width: 1, height: 1 };
  try {
    hero = await createHero({ renderer, assets, textures: textureSet(profile, framing), anisotropy: settings.anisotropy, signal, invalidate });
    lattice = await createLattice({ renderer, environment: hero.environment });
    transistor = await createTransistor({ renderer, environment: hero.environment, msaa: settings.antialias, taps: settings.antialias ? 24 : 12 });
    signal?.throwIfAborted();
    legacy = createLegacyScenes(renderer.getContext());
  } catch (error) {
    hero?.dispose(); lattice?.dispose(); transistor?.dispose(); assets.dispose(); renderer.dispose();
    throw error;
  }

  function resize(width, height, next = {}) {
    current = { ...current, ...next, width, height };
    const p = PROFILES[current.profile];
    renderer.setPixelRatio(pixelRatio(current.profile, window.devicePixelRatio, width, height));
    renderer.setSize(width, height, false);
    hero.resize(width, height, current.framing);
    hero.setAnisotropy(p.anisotropy);
    lattice.resize(width, height, current.framing, p.lod);
    transistor.resize(width, height, current.framing, { msaa: p.antialias, taps: p.antialias ? 24 : 12 });
    legacy.resize(width, height, p.lod);
  }

  return {
    resize,
    /**
     * state: { index, progress, transition, hero, time, parallax, power }.
     * Returns the CPU time spent in ms (the GPU cost is only visible as frame intervals).
     */
    frame(state) {
      const started = performance.now();
      timer?.begin();
      const u = latticeProgress(state);
      scale = null;
      if (state.index === 0) {
        // Hero, then the fracture face dims while the lattice emerges in front of it (no cut).
        const entry = entryPhases(state.hero);
        if (entry.hero) hero.render(state);
        if (entry.lattice > 0) scale = lattice.render({ u, time: state.time, emerge: entry.lattice, fade: entry.dark, over: entry.hero });
        else if (!entry.hero) renderer.clear();
      } else if (state.index === 1) {
        // Hand-over 01 -> 02 through the background: the lattice recedes into the fog, then the
        // transistor comes up out of the graphite.
        const blend = state.transition;
        if (blend < .5) scale = lattice.render({ u, time: state.time, emerge: 1 - smoothstep(0, .5, blend) });
        else transistor.render({ progress: 0, time: state.time, power: state.power, fade: smoothstep(.5, 1, blend) });
      } else if (state.index === 2) {
        // Chapter 02; on the way out it fades to the background and chapter 03 (legacy) fades in.
        scale = transistor.render({ progress: state.progress, time: state.time, power: state.power, fade: 1 - smoothstep(0, .5, state.transition) });
        if (scale) scale.scene = 'transistor';
        if (state.transition > 0) {
          renderer.resetState();
          legacy.render({ ...state, keep: true });
          renderer.resetState();
        }
      } else {
        renderer.resetState();
        legacy.render(state);
        renderer.resetState();
      }
      timer?.end();
      return performance.now() - started;
    },
    /** Scale bar of the last frame ({ nm, px, label, scene }), null when no true scale is on screen. */
    get scale() { return scale; },
    /** GPU time per rendered frame in ms (EXT_disjoint_timer_query_webgl2), only with gpuTimer. */
    gpuTimes: timer?.samples ?? null,
    get diagnostics() {
      const gl = renderer.getContext(), info = renderer.info;
      return { ...current, pixelRatio: renderer.getPixelRatio(), buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        calls: info.render.calls, lattice: lattice.count, triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries,
        assets: assets.size, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure };
    },
    dispose() {
      hero.dispose(); lattice.dispose(); transistor.dispose(); legacy.dispose(); assets.dispose();
      renderer.dispose();
    },
  };
}

/**
 * GPU time of each frame through EXT_disjoint_timer_query_webgl2. Results arrive a few frames
 * late; at most four queries are in flight, disjoint (invalid) results are dropped.
 */
function createGpuTimer(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const pending = [], samples = [];
  let query = null;
  return {
    samples,
    begin() {
      if (pending.length >= 4) return;
      query = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    },
    end() {
      if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(query); query = null; }
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const done = pending.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) samples.push(gl.getQueryParameter(done, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(done);
        if (samples.length > 3000) samples.shift();
      }
    },
  };
}
