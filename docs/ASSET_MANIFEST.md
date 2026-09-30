# Asset manifest

## Runtime (fonts, libraries)

Section owned by stage A3 (runtime). The model, HDR, camera and poster entries belong to the A2
section of this file.

| File / package | Used by | Source | Licence | Version | Transfer | Notes |
|---|---|---|---|---|---|---|
| `three` (WebGLRenderer, GLTFLoader, HDRLoader, PMREMGenerator) | lazy GPU chunk `assets/renderer-*.js` | npm, https://github.com/mrdoob/three.js | MIT | 0.186.1 (lockfile) | see `docs/PERFORMANCE.md` (brotli) | Tree-shaken into one lazy chunk; never downloaded in `calm`, with reduced motion, Save-Data or without WebGL 2. `HDRLoader` is the r180+ name of `RGBELoader` (same RGBE parser). No Draco, meshopt or KTX2 decoders: the A2 GLBs do not use them. |
| `vite` | build and dev server only | npm, https://github.com/vitejs/vite | MIT | 8.3.1 (lockfile) | 0 (not shipped) | |
| Fonts | whole page | system font stacks (`--serif`, `--sans`, `--mono` in `src/styles.css`) | n/a | n/a | 0 | Decision in A3: no webfont yet. Vendoring e.g. Instrument Serif (OFL) would change line lengths in every chapter and needs a re-layout pass; it is left for the typography pass, not bundled silently. On Linux the serif resolves to P052/DejaVu, on macOS Iowan Old Style, on Windows Palatino Linotype, so headlines differ slightly per system. |
| `src/assets/scene-1.webp` ... `scene-6.webp` | chapter posters 01-06 (calm, no-JS, before the GPU layer) | v0.1, `scripts/art/` (Mesa EGL replay of the legacy scenes) | project | v0.1 | 5-107 KiB each | Unchanged from v0.1 until stages B/C. The v0.1 hero poster `scene-0.webp` is removed; the hero uses the A2 posters. |
