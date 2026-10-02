/**
 * GPU layer, imported lazily by the text layer (never in the calm profile). One canvas, one
 * WebGL 2 context, one WebGLRenderer. The text layer owns the only requestAnimationFrame loop
 * and calls frame(state) from it; this module never schedules frames itself.
 */
import { PCFShadowMap, WebGLRenderer } from 'three';
import { createAssetManager } from './assets.js';
import { PROFILES, pixelRatio, textureSet } from './quality.js';
import { entryPhases, latticeProgress, smoothstep } from '../story/timeline.js';
import { createHero } from '../scenes/hero.js';
import { createLattice } from '../scenes/lattice.js';
import { createWafer } from '../scenes/wafer.js';
import { WAFER_START, waferState } from '../scenes/wafer-math.js';
import { createTransistor } from '../scenes/transistor.js';
import { createScale } from '../scenes/scale.js';
import { createWorld } from '../scenes/world.js';
import { createAi } from '../scenes/ai.js';
import { createDof } from './dof.js';
import { finaleState } from '../scenes/finale-math.js';

const dofSettings = p => ({ msaa: p.antialias, taps: p.antialias ? 24 : 12 });

export async function createGpuLayer({ canvas, profile, framing, signal, invalidate, gpuTimer = false }) {
  const settings = PROFILES[profile];
  // Throws when WebGL 2 is unavailable; the caller falls back to posters.
  const renderer = new WebGLRenderer({ canvas, antialias: settings.antialias, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const assets = createAssetManager();
  const timer = gpuTimer ? createGpuTimer(renderer.getContext()) : null; // QA/debug only
  let hero = null, lattice = null, wafer = null, transistor = null, scaleScene = null, world = null, ai = null, dof = null, scale = null, current = { profile, framing, width: 1, height: 1 };
  try {
    hero = await createHero({ renderer, assets, textures: textureSet(profile, framing), anisotropy: settings.anisotropy, signal, invalidate });
    lattice = await createLattice({ renderer, environment: hero.environment });
    dof = createDof(renderer, dofSettings(settings));
    wafer = await createWafer({ renderer, dof });
    transistor = await createTransistor({ renderer, environment: hero.environment, dof });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    scaleScene = await createScale({ renderer, environment: hero.environment, dof, shadows: settings.antialias });
    world = await createWorld({ renderer, environment: hero.environment, dof });
    ai = await createAi({ renderer, environment: hero.environment, dof });
    signal?.throwIfAborted();
  } catch (error) {
    hero?.dispose(); lattice?.dispose(); wafer?.dispose(); transistor?.dispose(); scaleScene?.dispose(); world?.dispose(); ai?.dispose(); dof?.dispose(); assets.dispose(); renderer.dispose();
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
    wafer.resize(width, height, current.framing);
    transistor.resize(width, height, current.framing);
    transistor.setTrails(p.antialias ? 4 : 2);
    scaleScene.resize(width, height, current.framing);
    world.resize(width, height, current.framing);
    ai.resize(width, height, current.framing);
    scaleScene.setShadows(p.antialias);
    dof.configure(dofSettings(p));
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
      // Scenes that composite with an opacity draw over the canvas: start from a clear page.
      renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 0); renderer.clear();
      const u = latticeProgress(state);
      scale = null;
      if (state.index > 0) hero.prepare();
      if (state.index === 0) {
        // Hero, then the fracture face dims while the lattice emerges in front of it (no cut).
        const entry = entryPhases(state.hero);
        if (entry.hero) hero.render(state);
        if (entry.lattice > 0) scale = lattice.render({ u, time: state.time, emerge: entry.lattice, fade: entry.dark, over: entry.hero });
        else if (!entry.hero) renderer.clear();
      } else if (state.index === 1) {
        // Chapter 01: the glide to the channel, then (from WAFER_START) the pull-back over the cut
        // face to the wafer; on the way out the camera dives back to the surface, onto chapter 02.
        if (state.progress < WAFER_START && state.transition === 0) {
          // The sway calms down before the glide ends, so the pull-back starts on the exact frame.
          scale = lattice.render({ u, time: state.time, emerge: 1, sway: 1 - smoothstep(WAFER_START - .08, WAFER_START, state.progress) });
        } else {
          const w = waferState({ progress: state.progress, transition: state.transition, framing: current.framing });
          if (w.lattice > 0) scale = lattice.render({ u: 1, time: state.time, emerge: 1, view: w.cam, cut: w.cut });
          if (w.wafer > 0) { const bar = wafer.render({ cam: w.cam, opacity: w.wafer }); if (w.lattice < .5) scale = bar; }
          if (w.transistor > 0) transistor.render({ progress: 0, time: state.time, power: state.power, fade: w.transistor });
          if (state.transition > 0) scale = null;
        }
      } else if (state.index === 2) {
        // Chapter 02; on the way out the chapter 03 scene (same camera at its start, the device
        // now one of a row) comes up under it and the transistor dissolves away.
        if (state.transition > 0) scaleScene.render({ progress: 0, time: state.time });
        scale = transistor.render({ progress: state.progress, time: state.time, power: state.power, fade: 1 - smoothstep(0, .6, state.transition) });
      } else if (state.index === 3) {
        // Chapter 03; on the way out chapter 04 (same camera on the die) comes up under it.
        if (state.transition > 0) world.render({ progress: 0, time: state.time });
        scale = scaleScene.render({ progress: state.progress, time: state.time, opacity: 1 - smoothstep(0, .6, state.transition) });
        if (state.transition > .6) scale = null;
      } else if (state.index === 4) {
        // Chapter 04; it ends on the die, where chapter 05 begins (same camera): a cross-fade.
        if (state.transition > 0) ai.render({ progress: 0, time: state.time, ai: state.ai });
        scale = world.render({ progress: state.progress, time: state.time, opacity: 1 - smoothstep(0, .6, state.transition) });
        if (state.transition > .6) scale = null;
      } else if (state.index === 5) {
        // Chapter 05; its last frame is chapter 06's first (finale-math.js), so it simply holds.
        scale = ai.render({ progress: state.progress, time: state.time, ai: state.ai });
      } else {
        // Chapter 06: the chip on its board, the device closing around it, the site on its screen,
        // then the real chunk over the chunk on that screen.
        const f = finaleState(state.progress, current.framing, current.width / current.height);
        if (f.board < 1) ai.render({ progress: 1, time: state.time, ai: state.ai, view: f.cam });
        if (f.board > 0 && f.device > 0) world.render({ progress: 1, time: state.time, opacity: f.board * f.device, finale: f });
        // A slow sway once the chunk has settled (the ambient clock; a frozen QA frame holds still).
        const sway = .12 * Math.sin(state.time * 2 * Math.PI / 40) * smoothstep(.84, 1, state.progress);
        // As the stage scrolls away into the sources the chunk goes up with it (2 NDC = one screen).
        const rect = f.chunk && { c: [f.chunk.c[0], f.chunk.c[1] + 2 * state.transition], h: f.chunk.h };
        if (rect) hero.renderOver({ rect, theta: f.theta + sway, fade: 1 - .5 * smoothstep(0, 1, state.transition) });
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
      hero.dispose(); lattice.dispose(); wafer.dispose(); transistor.dispose(); scaleScene.dispose(); world.dispose(); ai.dispose(); dof.dispose(); assets.dispose();
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
