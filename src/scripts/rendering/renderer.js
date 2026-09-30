/**
 * GPU layer, imported lazily by the text layer (never in the calm profile). One canvas, one
 * WebGL 2 context, one WebGLRenderer. The text layer owns the only requestAnimationFrame loop
 * and calls frame(state) from it; this module never schedules frames itself.
 */
import { WebGLRenderer } from 'three';
import { createAssetManager } from './assets.js';
import { PROFILES, pixelRatio, textureSet } from './quality.js';
import { entryPhases } from '../story/timeline.js';
import { createHero } from '../scenes/hero.js';
import { createLegacyScenes } from '../scenes/legacy.js';

export async function createGpuLayer({ canvas, profile, framing, signal, invalidate, gpuTimer = false }) {
  const settings = PROFILES[profile];
  // Throws when WebGL 2 is unavailable; the caller falls back to posters.
  const renderer = new WebGLRenderer({ canvas, antialias: settings.antialias, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const assets = createAssetManager();
  const timer = gpuTimer ? createGpuTimer(renderer.getContext()) : null; // QA/debug only
  let hero = null, legacy = null, current = { profile, framing, width: 1, height: 1 };
  try {
    hero = await createHero({ renderer, assets, textures: textureSet(profile, framing), anisotropy: settings.anisotropy, signal, invalidate });
    legacy = createLegacyScenes(renderer.getContext());
  } catch (error) {
    hero?.dispose(); assets.dispose(); renderer.dispose();
    throw error;
  }

  function resize(width, height, next = {}) {
    current = { ...current, ...next, width, height };
    const p = PROFILES[current.profile];
    renderer.setPixelRatio(pixelRatio(current.profile, window.devicePixelRatio, width, height));
    renderer.setSize(width, height, false);
    hero.resize(width, height, current.framing);
    hero.setAnisotropy(p.anisotropy);
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
      if (state.index === 0 && entryPhases(state.hero).scene === 'hero') hero.render(state);
      else {
        const material = state.index === 0;
        renderer.resetState();
        legacy.render({ ...state, index: material ? 1 : state.index, progress: material ? 0 : state.progress, transition: material ? 0 : state.transition });
        renderer.resetState();
      }
      timer?.end();
      return performance.now() - started;
    },
    /** GPU time per rendered frame in ms (EXT_disjoint_timer_query_webgl2), only with gpuTimer. */
    gpuTimes: timer?.samples ?? null,
    get diagnostics() {
      const gl = renderer.getContext(), info = renderer.info;
      return { ...current, pixelRatio: renderer.getPixelRatio(), buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        calls: info.render.calls, triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries,
        assets: assets.size, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure };
    },
    dispose() {
      hero.dispose(); legacy.dispose(); assets.dispose();
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
