/**
 * Depth of field shared by the scenes drawn at true scale (chapters 02 and 03): the scene goes
 * into a linear HDR target with depth, then one full-screen pass blurs by the thin-lens circle of
 * confusion around the focal plane (the plane the scale bar is true for), tone maps, and
 * composites over the canvas with an opacity (fades through the page background, cross-fades).
 * Everything is relative to the focus distance, so it works from nanometres to millimetres.
 */
import {
  Color, DepthTexture, HalfFloatType, Mesh, NormalBlending, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial,
  Vector2, WebGLRenderTarget,
} from 'three';

const BG = new Color().setRGB(11 / 255, 14 / 255, 18 / 255);

/** settings: { msaa, taps } of the current profile; configure() follows a runtime demotion. */
export function createDof(renderer, settings = { msaa: true, taps: 24 }) {
  const makeTarget = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: settings.msaa ? 4 : 0, depthTexture: new DepthTexture(1, 1) });
  let target = makeTarget();
  const post = new Scene();
  const composite = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new Vector2() },
      uNear: { value: 1 }, uFar: { value: 1 }, uFocus: { value: 1 }, uCoc: { value: 0 }, uOpacity: { value: 1 }, uBg: { value: BG },
      uTaps: { value: settings.taps }, uFarMax: { value: 12 },
    },
    transparent: true, blending: NormalBlending, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tColor, tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uFocus, uCoc, uOpacity, uTaps, uFarMax; uniform vec3 uBg; varying vec2 vUv;
      float depthAt(vec2 uv) { float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
      // Behind the focus the blur may be capped lower (uFarMax), so a far field stays legible.
      float cocAt(float z) { return z > uFocus ? min(uCoc * (z - uFocus) / z, uFarMax) : min(uCoc * (uFocus - z) / z, 12.0); }
      void main() {
        float z0 = depthAt(vUv), c0 = cocAt(z0);
        vec4 sum = texture2D(tColor, vUv); float wsum = 1.0;
        // Tap count is a uniform (up to 24), so a profile change needs no recompile.
        for (int i = 0; i < 24; i++) {
          if (float(i) >= uTaps) break;
          float r = sqrt((float(i) + .5) / uTaps), a = float(i) * 2.39996;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * r * c0 * uTexel;
          float z = depthAt(uv);
          // A sharper sample in front of this pixel must not smear over it; samples behind may.
          float w = z >= z0 * .995 ? 1.0 : clamp(cocAt(z) - r * c0 + 1.0, 0.0, 1.0);
          sum += texture2D(tColor, uv) * w; wsum += w;
        }
        vec4 c = sum / wsum;
        gl_FragColor = vec4(c.rgb / max(c.a, 1e-4), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor = vec4(mix(uBg, gl_FragColor.rgb, clamp(c.a, 0.0, 1.0)), uOpacity);
      }`,
  }));
  composite.frustumCulled = false;
  post.add(composite);
  const postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let postCompiled = false;
  const buffer = new Vector2();

  return {
    configure(next) {
      if (next.msaa !== settings.msaa) { target.dispose(); settings = next; target = makeTarget(); }
      settings = next;
      composite.material.uniforms.uTaps.value = settings.taps;
    },
    /** Draws scene with camera; aperture: blur radius as a share of the frame height per |z - focus| / z. */
    render(scene, camera, { focus, aperture, opacity = 1, farMax = 12 }) {
      renderer.getDrawingBufferSize(buffer);
      if (target.width !== buffer.x || target.height !== buffer.y) target.setSize(buffer.x, buffer.y);
      const u = composite.material.uniforms;
      u.tColor.value = target.texture; u.tDepth.value = target.depthTexture;
      u.uTexel.value.set(1 / buffer.x, 1 / buffer.y);
      u.uNear.value = camera.near; u.uFar.value = camera.far; u.uFocus.value = focus;
      u.uCoc.value = aperture * buffer.y; u.uOpacity.value = opacity; u.uFarMax.value = farMax;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      // Composite over whatever the canvas already holds (a cross-fade, or the cleared page).
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(post, postCamera);
      renderer.autoClear = auto;
    },
    /**
     * Compile the scene's programs for the target it is drawn into (linear, no tone mapping):
     * compiling against the canvas builds other variants, and the real ones then link mid-scroll.
     */
    async compile(scene, camera) {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      try { await renderer.compileAsync(scene, camera); } finally { renderer.setRenderTarget(previous); }
      // The composite is drawn to the canvas (tone mapped); compile that variant once too, or it
      // links on the first frame of whichever chapter is seen first (a 40-70 ms hitch).
      if (!postCompiled) {
        postCompiled = true;
        renderer.setRenderTarget(null);
        try { await renderer.compileAsync(post, postCamera); } finally { renderer.setRenderTarget(previous); }
      }
      // Without KHR_parallel_shader_compile three checks a program's link on its first draw and
      // that check waits for the link (50-110 ms mid-scroll on the first sight of a material).
      // Check them now, one per task, while the page is still loading.
      const programs = new Set();
      for (const s of [scene, post]) s.traverse(o => [o.material].flat().forEach(m => { const p = m && renderer.properties.get(m).currentProgram; if (p) programs.add(p); }));
      for (const p of programs) { p.getUniforms(); await new Promise(done => setTimeout(done)); }
    },
    dispose() { target.dispose(); composite.geometry.dispose(); composite.material.dispose(); },
  };
}
