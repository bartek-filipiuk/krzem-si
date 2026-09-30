# Chunk: Cycles poster vs Three.js

Capture: `python tests/screens.py handover` against `npm run preview -- --port 4174`, URL
`?scene=poczatek&progress=0&quality=cinematic&freeze=1`, headless Chromium on the RTX 3070
(ANGLE/EGL with the NVIDIA vendor file). Live renderer state read from `krzemDebug.gpu`:
`toneMapping` 7 (NeutralToneMapping), `exposure` 1.1892, 56,000 triangles.
`chunk-in-three.webp` is the desktop canvas frame.

| environmentIntensity | desktop chunk luminance, canvas / poster | mobile | mean abs diff on chunk pixels (desktop / mobile) |
|---|---|---|---|
| 1.0 | 63.6 / 75.4 | 58.4 / 73.8 | 16.3 / 20.3 |
| 1.25 | 71.9 / 75.4 | 67.3 / 73.8 | 13.6 / 16.0 |
| **1.35 (shipped)** | **75.0 / 75.4** | **70.6 / 73.8** | **13.7 / 15.4** |
| 1.45 | 77.9 / 75.4 | 73.7 / 73.8 | 14.3 / 15.3 |

Background luminance 14.6 / 14.9, so the graphite matches.

What matches: framing, silhouette, highlight positions and shapes, grain, cracks, normal-map
orientation. The relief is not inverted, so the green channel is right, and the per-pixel tangent
frame Three.js derives (the GLB has no TANGENT) agrees with the MikkTSpace bake.

What differed and what was done:

- Chunk about 16 % darker at environmentIntensity 1: most of the gap is on the large concave scoop
  and the mid-grey faces. The baked AO is not the cause (occlusion strength 0 moved desktop only
  from 63.6 to 64.5). The cause is interreflection: in Cycles the scoop reflects the lit lump, in
  Three.js it only sees the dark studio. Fixed on the asset side with `environmentIntensity: 1.35`
  in `hero-camera.json`, which `src/scripts/scenes/hero.js` already reads. No runtime change.
- Thin bright hair-like streaks on the walls of the small flake scars (right side of the chunk).
  Cause: very thin UV islands on those walls, where mip filtering and the derived tangents
  disagree with the bake. Visible on the still frame, not at reading distance. Asset-side fix if
  wanted: raise `island_margin` in `unwrap()` and the bake margin, or ship tangents again (+743 KB
  on 2K, which breaks the 3 MiB budget). Nothing for the runtime to change.
- Hairline cracks are slightly fainter in Three.js (thin grooves lose contrast in the normal-map
  mips). Accepted.
- The Cycles poster has a faint sawtooth on two flake-scar edges (right edge and lower right of the
  desktop poster). It comes from the 56k-triangle decimation of the thin walls and shows in both
  renderers. Would need the flake walls kept out of the decimation or fewer, wider flakes.
