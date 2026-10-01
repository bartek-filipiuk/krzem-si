# Performance: budgets and measurements

Stage A3 (hero + entry into the material), measured 2026-09-30 on the reference laptop. Raw data:
`docs/qa/after/capture-nvidia.json` and `capture-amd.json` (written by `tests/screens.py`).
Environment and the full QA report: `docs/qa/PREMIUM_REPORT.md`.

Everything below is lab data from headless Chromium on one machine. It says nothing about field
Core Web Vitals, phones or other browsers.

## Budgets (brief §7) and status

| Scope | Budget | Measured (brotli / raw) | Status |
|---|---|---|---|
| First readable mobile view, empty cache | <= 600 KiB | 101.3 / 133.7 KiB (HTML, CSS, JS, mobile poster, lazy chapter posters 1-2 that the browser pulled early) | met |
| Hero interactive, mobile | <= 3 MiB | 1011.0 / 1962.8 KiB (1K GLB 711.1, renderer chunk 130.1, HDR 68.5) | met |
| Hero interactive, desktop | <= 5 MiB | 2323.4 / 3695.2 KiB (2K GLB 2019.8, renderer 130.1, HDR 68.5) | met |
| Entry detail after the handover (`fracture-face.glb`) | part of the session | 495.7 / 692.8 KiB, requested ~20 frames after the handover or on first scroll | n/a |
| Full calm-scrolled session | <= 15 MiB mobile / 25 MiB desktop | upper bound = every file in `dist/` for that framing: 1686.6 / 2835.5 KiB mobile, 2999.0 / 4567.9 KiB desktop | met (upper bound, stages B/C will add) |
| DPR cap | 1.5 cinematic, 1.0 balanced + pixel budget | cinematic mobile 390×844 @2 → buffer 585×1266 (1.5); balanced 390×844 (1.0); desktop 1440×1000 @1 → 1.0 | met |
| Textures | 1K mobile / 2K desktop | 2K only for cinematic + desktop framing, 1K otherwise (`textureSet`) | met |
| Active renderers | 1 | one canvas, one WebGL 2 context, one `WebGLRenderer` | met |
| Initial text layer (own budget in `scripts/build.mjs`) | <= 30 KiB brotli | 13.6 KiB | met |

How: `transfer` step of `tests/screens.py` records every request of a fresh page until the hero is
live, then 5 s more, against `vite preview` of the built `dist/`. Sizes come from the files in
`dist/`: brotli = the precompressed `.br` sidecar that `scripts/build.mjs` writes and Caddy serves
(`precompressed br gzip` in `deploy/Caddyfile`), raw = the file itself. WebP has no sidecar (same
number in both columns). `vite preview` itself does not send brotli, so bytes on the wire in the
lab would be the raw column.

## Frame timing

Two measures, both only with `debug` (QA mode):

- `krzemDebug.intervals`: the interval between frames that were actually rendered (the same
  numbers the quality controller judges).
- `krzemDebug.gpuMs`: GPU time per rendered frame from `EXT_disjoint_timer_query_webgl2`. Added in
  A3 because headless Chromium caps requestAnimationFrame at 60 Hz, so intervals alone show
  dropped frames but not headroom.

Scenario (`perf` step): fresh load with the profile forced, 4 s idle hero (ambient turn), then a
scripted scroll hero → material over 8 s, 1 s hold, back to 40 % over 2.5 s, forward again over
2.5 s. Intervals in ms: median / p95 (/ max). `>50` = intervals over 50 ms.

| GPU | profile / framing | buffer (DPR) | idle hero | scroll through the entry | >50 | GPU time median / p95 / max | CPU per frame (median) |
|---|---|---|---|---|---|---|---|
| RTX 3070 | cinematic / desktop | 1440×1000 (1) | 16.7 / 16.7 | 16.7 / 16.7 / 33.3 | 0 | 2.38 / 4.16 / 14.8 | 0.3 |
| RTX 3070 | cinematic / mobile | 585×1266 (1.5) | 16.7 / 16.7 | 16.7 / 16.7 / 33.3 | 0 | 1.58 / 4.89 / 16.9 | 0.3 |
| RTX 3070 | balanced / desktop | 1440×1000 (1) | 16.7 / 16.7 | 16.7 / 16.7 / 33.3 | 0 | 0.59 / 2.02 / 33.3 | 0.3 |
| RTX 3070 | balanced / mobile | 390×844 (1) | 16.7 / 16.8 | 16.7 / 16.8 / 33.3 | 0 | 0.38 / 2.34 / 47.8 | 0.3 |
| AMD iGPU | balanced / desktop | 1440×1000 (1) | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 | 0.66 / 6.85 / 10.5 | 0.3 |
| AMD iGPU | balanced / mobile | 390×844 (1) | 16.7 / 16.7 | 16.7 / 16.7 / 33.3 | 0 | 0.5 / 2.85 / 4.7 | 0.3 |
| AMD iGPU | cinematic / desktop | 1440×1000 (1) | 16.7 / 16.8 | 16.7 / 16.7 / 33.4 | 0 | 1.51 / 7.71 / 11.5 | 0.3 |
| AMD iGPU | cinematic / mobile | 585×1266 (1.5) | 16.7 / 16.7 | 16.7 / 16.7 / 33.3 | 0 | 0.83 / 5.26 / 9.1 | 0.3 |

During the recordings (video capture running, cinematic, RTX 3070): desktop 36 s scripted scroll,
2437 frames, 16.7 / 16.7 / max 33.4, GPU 1.03 / 2.59 / max 36.3 ms; mobile 14.5 s, 874 frames,
16.7 / 16.8 / max 33.3, GPU 1.39 / 3.32 / max 8.5 ms.

Reading: no profile on either GPU dropped below the 60 Hz cadence in the lab, and the single GPU
maxima (33-48 ms) are single frames, not a trend (not isolated; most likely the entry patch
upload or the first draw of the legacy chapter scene). The AMD iGPU p95 GPU time in cinematic desktop (7.7 ms) is the tightest
number: about half the 16.7 ms frame. The display here is a 1440×1000 surface at DPR 1; a 4K
laptop panel at DPR 1.5 would push the same GPU to about 3.4 Mpx (the cinematic pixel budget).

## Quality controller

Profile order and hysteresis are in `src/scripts/rendering/quality.js` and covered by
`tests/core.test.mjs` (6 tests). In the browser, `tests/browser_smoke.py` simulates a slow GPU with
a 50 ms busy wait per frame: the page steps cinematic → balanced → calm, one step at a time,
within 3-20 s, keeps the story readable (static layout, poster) and does not climb back.
Limits: cinematic median 22 / p95 40 ms, balanced 40 / 70 ms, 60 frames or 2 s per window, two
slow windows per step, holds after shader compile, chapter change and tab return.

## Lab LCP and CLS

`transfer` step, localhost, no throttling, PerformanceObserver (`largest-contentful-paint`,
`layout-shift` without recent input), read 5 s after the renderer went live (so the poster →
canvas handover is inside the window):

| framing | LCP | LCP element | CLS |
|---|---|---|---|
| desktop 1440×1000 | 108 ms | `H1` (hero heading) | 0 |
| mobile 390×844 | 92 ms | `H1` (hero heading) | 0 |

These are lab numbers on localhost. They do not predict field LCP on a phone network.

## Poster handover

`handover` step: the same frozen frame twice, renderer live and poster forced back on top, text
hidden. Mean per-pixel difference over the chunk and mean luminance (0-255):

| framing | chunk luminance canvas / poster | background canvas / poster | mean abs diff chunk / whole frame |
|---|---|---|---|
| desktop | 83.7 / 84.0 | 14.9 / 15.2 | 9.75 / 1.73 |
| mobile | 93.9 / 93.7 | 14.7 / 15.1 | 16.66 / 2.62 |

The remaining per-pixel difference is structure (interreflection in Cycles, finer highlights,
streak artefacts), not exposure. The 300 ms cross-fade hides it.

## Chapter 01: silicon lattice (2026-10-01)

Same machine, headless Chromium, `vite preview` of the built `dist/`. Raw data: `lattice_perf`
in `docs/qa/after/capture-nvidia.json` and `capture-amd.json`; the AMD cinematic rows are an
ad hoc run of the same function (`lattice_perf_cinematic_adhoc` in `capture-amd.json`).

Scenario (`lattice-perf` step): profile forced, scroll to the end of chapter 01, 4 s idle on the
final monocrystal frame (ambient drift), then hero top → end of chapter 01 over 9 s, back to the
middle over 2.5 s, forward again over 2.5 s. Intervals and GPU time in ms, median / p95 (/ max).

| GPU | profile / framing | buffer | atoms / bonds | idle interval | scroll interval | >50 | GPU idle | GPU scroll |
|---|---|---|---|---|---|---|---|---|
| RTX 3070 | cinematic / desktop | 1440×1000 | 13397 / 25107 | 16.7 / 16.8 | 16.7 / 16.7 / 16.8 | 0 | 2.06 / 3.82 | 3.06 / 6.09 / 9.3 |
| RTX 3070 | cinematic / mobile | 585×1266 | 10577 / 19869 | 16.7 / 16.7 | 16.7 / 16.8 / 33.4 | 0 | 2.07 / 2.62 | 2.17 / 3.78 / 11.6 |
| RTX 3070 | balanced / desktop | 1440×1000 | 9895 / 18423 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 | 1.78 / 1.81 | 1.76 / 3.42 / 4.4 |
| RTX 3070 | balanced / mobile | 390×844 | 7943 / 14826 | 16.7 / 16.8 | 16.7 / 16.7 / 16.8 | 0 | 0.8 / 0.84 | 0.71 / 1.19 / 1.9 |
| AMD iGPU | balanced / desktop | 1440×1000 | 9895 / 18423 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 | 4.85 / 13.11 | 5.17 / 12.19 / 20.0 |
| AMD iGPU | balanced / mobile | 390×844 | 7943 / 14826 | 16.7 / 16.7 | 16.7 / 16.8 / 16.8 | 0 | 1.67 / 1.99 | 1.5 / 2.83 / 3.2 |
| AMD iGPU | cinematic / desktop | 1440×1000 | 13397 / 25107 | 16.7 / 16.8 | 16.7 / 16.7 / 16.8 | 0 | 6.72 / 6.74 | 6.42 / 11.22 / 12.5 |
| AMD iGPU | cinematic / mobile | 585×1266 | 10577 / 19869 | 16.7 / 16.8 | 16.7 / 16.8 / 16.8 | 0 | 3.72 / 4.17 | 3.45 / 6.67 / 12.0 |

Recording (`lattice-record`, cinematic, RTX 3070, video capture running): 32 s, 1928 frames,
16.7 / 16.7 / max 33.4 ms, GPU 1.69 / 3.67 / max 17.1 ms.

Reading: balanced on the AMD Renoir iGPU stays inside a 16.7 ms frame with a GPU median of about
5 ms on desktop; its p95 (12-13 ms) is the tightest number in the table and is the one to watch on
weaker integrated GPUs. Cinematic on the same iGPU has a similar median-to-p95 range, so for this
scene the profile difference is mainly atom count and fog depth, not a cliff. Atoms are two-triangle
sphere impostors; the cost is fill and the bond cylinders (12 triangles each).

CPU: the lattice is built once per framing and level of detail (`buildLattice`), about 100 ms in
Node 22 on this laptop for the cinematic desktop block, plus shader compile; it runs inside the
lazy GPU-layer start-up, before the first frame. A phone CPU will take several times longer
(not measured). Per frame the lattice only sets a few uniforms.

Bytes: the lattice adds no asset files at runtime; the lazy renderer chunk is 134.9 KiB brotli
(130.1 before). The chapter 01 posters (`lattice-desktop.webp` 154 KiB, `lattice-mobile.webp`
71 KiB) replace `scene-1.webp` (66 KiB). They are `loading="lazy"` like before, so the browser
may still fetch them early (A3 saw chapter posters 1-2 in the first view) and also in motion mode,
where they stay hidden. On mobile that is +5 KiB against the old poster, on desktop +88 KiB. The
transfer table above was not re-measured for this change.
