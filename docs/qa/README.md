# QA

- Stage A (hero + entry into the material): `docs/qa/PREMIUM_REPORT.md` (Polish), measurements in
  `docs/PERFORMANCE.md`, captures and recordings in `docs/qa/after/`, browser test report
  `docs/qa/browser-report.json` (129 checks at stage A, Chromium on the RTX 3070).
- v0.1 baseline: `docs/qa/before/` and `docs/qa/AUDIT.md`.
- Chunk asset QA (Blender vs Three.js): `docs/qa/assets/NOTES.md`.
- Chapter 01 silicon lattice (2026-10-01): board `docs/qa/after/lattice-board.webp` (hero 0.76-0.94
  handover + chapter 01 at 0-100 %, cinematic/balanced on the RTX 3070, balanced on the AMD iGPU,
  calm posters), frames `docs/qa/after/lattice-*.webp`, recording
  `docs/qa/after/lattice-scroll-desktop.webm` (hero -> end of chapter 01 -> back -> forward),
  GPU times in `docs/PERFORMANCE.md` ("Chapter 01"). Browser report updated (137 checks). Before/after of the polish round: `lattice-v1-cinematic-desktop-{h088,050,100}.webp` (first version) next to `lattice-cinematic-desktop-{h088,050,100}.webp`.
- Chapter 02 FinFET (2026-10-01): board `docs/qa/after/transistor-board.webp` (OFF then ON at 0-100 %),
  frames `docs/qa/after/transistor-*.webp`; before/after of the readability round:
  `transistor-v1-cinematic-desktop-{off,on}-050.webp`, `transistor-v1-cinematic-mobile-on-050.webp`
  next to the same names without `v1`. GPU times in `docs/PERFORMANCE.md` ("Chapter 02").
- Chapter 03 interconnect and die (2026-10-01): board `docs/qa/after/scale-board.webp` (0, .16, .25, .3, .5,
  .6, .75, .8, 1), frames `docs/qa/after/scale-*.webp`, recording `docs/qa/after/scale-scroll-desktop.webm`
  (02 -> 03 -> 04 with a reverse and a fling), GPU times in `docs/PERFORMANCE.md` ("Chapter 03").
- Chapter 02 redesign (2026-10-01): `transistor-board.webp`, frames `transistor-*.webp` (before: `transistor-v2-*`),
  switch recording `transistor-switch-desktop.webm` (automatic ON, OFF, ON, double press, scroll through).
  Chapter 03 steep reveal: `scale-cinematic-desktop-060.webp` (before: `scale-v2-cinematic-desktop-060.webp`).
