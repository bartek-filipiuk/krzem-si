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

## Chapter 01: silicon lattice (2026-10-01, polish round with depth of field)

Same machine, headless Chromium, `vite preview` of the built `dist/` (port 4175). Raw data:
`lattice_perf` in `docs/qa/after/capture-nvidia.json` and `capture-amd.json`.

Scenario (`lattice-perf` step): profile forced, scroll to the end of chapter 01, 4 s idle on the
final monocrystal frame (ambient drift), then hero top → end of chapter 01 over 9 s, back to the
middle over 2.5 s, forward again over 2.5 s. Intervals and GPU time in ms, median / p95 (/ max).

| GPU | profile / framing | buffer | atoms / bonds | idle interval | scroll interval | >50 | GPU idle | GPU scroll |
|---|---|---|---|---|---|---|---|---|
| RTX 3070 | cinematic / desktop | 1440×1000 | 13397 / 25107 | 16.7 / 16.8 | 16.7 / 16.7 / 16.8 | 0 | 3.87 / 4.7 | 2.69 / 5.61 / 16.5 |
| RTX 3070 | cinematic / mobile | 585×1266 | 10577 / 19869 | 16.7 / 16.8 | 16.7 / 16.8 / 16.8 | 0 | 3.15 / 3.84 | 2.6 / 5.59 / 12.4 |
| RTX 3070 | balanced / desktop | 1440×1000 | 9895 / 18423 | 16.7 / 16.8 | 16.7 / 16.8 / 16.8 | 0 | 3.24 / 3.27 | 2.36 / 5.87 / 11.0 |
| RTX 3070 | balanced / mobile | 390×844 | 7943 / 14826 | 16.7 / 16.7 | 16.7 / 16.8 / 16.8 | 0 | 1.28 / 1.31 | 1.19 / 2.48 / 3.9 |
| AMD iGPU | balanced / desktop | 1440×1000 | 9895 / 18423 | 16.7 / 16.7 | 16.7 / 16.8 / 16.8 | 0 | 3.58 / 3.6 | 3.28 / 8.73 / 12.5 |
| AMD iGPU | balanced / mobile | 390×844 | 7943 / 14826 | 16.7 / 16.7 | 16.7 / 16.8 / 16.8 | 0 | 1.01 / 1.77 | 0.95 / 2.41 / 4.0 |

Recording (`lattice-record`, cinematic, RTX 3070, video capture running): 32.0 s, 1929 frames,
16.7 / 16.7 / max 16.8 ms, GPU 2.47 / 4.7 / max 28.6 ms.

Depth of field is done inside the atom shader (bigger, blended impostor quads with a soft disc),
not as a post-processing pass, so there is no extra full-screen pass. Compared with the first
lattice version (no depth of field, larger opaque atoms) the AMD iGPU balanced desktop GPU median
went from 4.85 to 3.58 ms (smaller atoms, fewer bond triangles drawn: out-of-focus bonds shrink to
zero), while the RTX 3070 cinematic desktop median went from 2.06 to 3.87 ms (blending and larger
blurred quads cost fill rate). Balanced on the AMD iGPU stays well inside a 16.7 ms frame. The
ad hoc AMD cinematic numbers of the first version (`lattice_perf_cinematic_adhoc` in
`capture-amd.json`) were not re-measured.

CPU: the lattice is built once per framing and level of detail (`buildLattice`), about 100 ms in
Node 22 on this laptop for the cinematic desktop block, plus shader compile and a one-off depth
sort of the atoms; it runs inside the lazy GPU-layer start-up, before the first frame. A phone CPU
will take several times longer (not measured). Per frame the lattice only sets a few uniforms.

Bytes: the lattice adds no asset files at runtime; the lazy renderer chunk is 135.1 KiB brotli
(130.1 before the lattice). The chapter 01 posters (`lattice-desktop.webp` 80 KiB,
`lattice-mobile.webp` 38 KiB) replace `scene-1.webp` (66 KiB). They are `loading="lazy"`, so the
browser may still fetch them early and also in motion mode, where they stay hidden. The transfer
table above was not re-measured for this change.

## Chapter 02: FinFET (2026-10-01)

Same machine and method (`transistor-perf` step of `tests/screens.py`, built site on port 4175):
switch forced ON, 4 s idle at chapter progress .5 (carriers moving), then a sweep through the
whole chapter and back. Raw data: `transistor_perf` in `docs/qa/after/capture-*.json`.

| GPU | profile / framing | buffer | idle interval | scroll interval | >50 | GPU idle | GPU scroll |
|---|---|---|---|---|---|---|---|
| RTX 3070 | cinematic / desktop | 1440×1000 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 | 4.74 / 6.85 | 4.83 / 5.49 / 8.2 |
| RTX 3070 | cinematic / mobile | 585×1266 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 | 4.36 / 4.71 | 4.44 / 4.71 / 9.0 |
| RTX 3070 | balanced / desktop | 1440×1000 | 16.7 / 16.8 | 16.7 / 16.8 / 16.8 | 0 | 5.2 / 5.26 | 4.89 / 5.19 / 7.2 |
| RTX 3070 | balanced / mobile | 390×844 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 | 1.04 / 1.07 | 1.03 / 1.07 / 3.4 |
| AMD iGPU | balanced / desktop | 1440×1000 | 16.7 / 16.8 | 16.7 / 16.8 / 16.8 | 0 | 5.63 / 5.68 | 5.62 / 5.7 / 5.8 |
| AMD iGPU | balanced / mobile | 390×844 | 16.7 / 16.8 | 16.7 / 16.8 / 16.8 | 0 | 0.92 / 0.94 | 0.92 / 0.93 / 0.9 |

Numbers after the readability round (one gate, no metal levels). The scene is ~50 boxes, but every fragment runs the cut-away test (and writes depth for section
faces) and the frame then goes through one full-screen depth-of-field pass (24 taps cinematic with
4x MSAA on the scene target, 12 taps balanced without; both follow a runtime demotion). That pass is most of the cost on large
viewports, which is why balanced desktop is not cheaper than cinematic on the RTX 3070. On the AMD
iGPU balanced desktop stays around 6 ms, well inside a 16.7 ms frame. Bytes: the renderer chunk is
139.2 KiB brotli (+4 KiB); the four FinFET posters are 11-19 KiB each and replace `scene-2.webp`.

## Chapter 03: interconnect stack and die (2026-10-01)

`scale-perf` step (built site, port 4175): idle 4 s at the reveal (progress .6), then a sweep of the
whole chapter and back. Raw data: `scale_perf` in `docs/qa/after/capture-*.json`.

| GPU | profile / framing | buffer | idle interval | scroll interval | >50 | GPU idle | GPU scroll |
|---|---|---|---|---|---|---|---|
| RTX 3070 | cinematic / desktop | 1440×1000 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 | 16.51 / 20.72 | 16.2 / 18.66 / 23.4 |
| RTX 3070 | cinematic / mobile | 585×1266 | 16.7 / 16.7 | 16.7 / 16.7 / 33.3 | 0 | 5.61 / 6.54 | 4.29 / 8.83 / 13.2 |
| RTX 3070 | balanced / desktop | 1440×1000 | 16.7 / 16.7 | 16.7 / 16.8 / 16.8 | 0 | 16.53 / 17.57 | 15.61 / 18.41 / 21.7 |
| RTX 3070 | balanced / mobile | 390×844 | 16.7 / 16.7 | 16.7 / 16.7 / 16.8 | 0 | 2.82 / 2.88 | 1.82 / 4.69 / 7.6 |
| AMD iGPU | balanced / desktop | 1440×1000 | 16.7 / 16.8 | 16.7 / 16.7 / 16.8 | 0 | 10.41 / 10.5 | 5.35 / 15.3 / 16.0 |
| AMD iGPU | balanced / mobile | 390×844 | 16.7 / 16.8 | 16.7 / 16.7 / 16.8 | 0 | 2.31 / 2.59 | 1.49 / 4.12 / 5.0 |

Short QA-mode runs right after load (`?scene=skala&progress=…&quality=balanced`, 1440×1000, GPU
median ms): RTX 3070 1.95 inside the layers (.3), 4.47 at the reveal (.6), 1.67 on the die (1);
AMD iGPU 13.1, 11.2 and 1.8.

Caveat on the RTX numbers above: in the longer `scale-perf` runs the laptop GPU reports about
16 ms per frame at desktop size while never missing a 16.7 ms frame and while the short runs show
2-5 ms; the driver drops to low clocks when there is slack (the GPU read 210 MHz between runs), so
the timer measures stretched work, not cost. The AMD numbers are consistent across runs and are the
budget reference: balanced desktop at the reveal ~10-11 ms, inside the layers ~13 ms, scroll p95
~15 ms. That is inside a 60 Hz frame but with little headroom; the next lever is a smaller real
square for the lowest levels on balanced.

Recording (`scale-record`, cinematic, RTX 3070, 02 -> 03 -> 04 with a reverse and a fling):
38.9 s, 2342 frames, 16.7 / 16.7 / max 33.4 ms.

Start-up: the routing (about 20 000 segments and vias, clearance along the camera path) takes about
0.4 s in Node 22 on this laptop and runs once when the GPU layer starts; all shader variants are
compiled for the depth-of-field target up front (compiling them for the canvas built the wrong
variants and cost up to 380 ms on first view). A phone CPU will be slower (not measured).
Bytes: renderer chunk 146.4 KiB brotli; chapter 03 posters replace `scene-3.webp`.

Steep reveal (2026-10-01, `scale-perf` long run, AMD iGPU balanced 1440×1000): idle at the reveal
GPU 11.3 / 12.2 ms (median / p95), scroll through the chapter GPU 4.9 / 14.9 / max 16.3 ms, frame
intervals 16.7 / 16.7 / max 16.8 ms, none over 50 ms. Mobile 3.4 / 3.7 idle, 1.4 / 4.1 scrolling.
Within a 60 Hz frame; the reveal is the most expensive frame of the chapter on the iGPU.

Chapter 02 redesign (2026-10-01, `transistor-perf`, switch ON, idle at the close view .5 then a sweep):
AMD iGPU balanced desktop GPU 7.9 / 8.5 ms idle, 7.3 / 8.4 ms scrolling; balanced mobile 1.6 / 1.7.
RTX 3070 balanced desktop 5.0 / 5.1. Frame intervals 16.7 ms, none over 50 ms. Glass parts and
particle trails are the cost (fill rate); balanced draws two trail copies instead of four. The
RTX cinematic long-run numbers show the same low-clock effect as chapter 03 (about 16 ms reported
without a missed frame) and are not a cost measure.
