# krzem.si premium — execution plan

Source of truth for the implementing agent. The brief (`KRZEM-SI-PREMIUM-BRIEF.md`) is the
spec; this file is the ordered work plan and the technical decisions already taken. When the
two disagree, the brief wins and the plan gets a note.

## Roles

- Planning and light review: Fable (session owner).
- Implementation: coding agents (Opus 5.5). Each stage is a self-contained task. Report in the
  brief's format: **what changed in the image, what proves it, what it costs on weak hardware**.
- Owner (Bartek) tests physical devices and decides on publication. Never push, never touch DNS.

## Hard rules (from the brief, do not re-litigate)

1. Semantic HTML, native scroll, static `dist/` deploy. No React/Next/CMS/backend.
2. Text layer and posters render and work with no JS, no WebGL, reduced motion.
3. One canvas, one renderer, one animation scheduler. Story state is a deterministic function
   of `(chapter, progress, explicit interaction)`; ambient has its own clock; seeded randomness.
4. Never `preventDefault` wheel/touch. No scroll hijacking, no forced "Start".
5. No placeholders described as final. No empty asset paths, no "add model here".
6. Commits: small, on branch `premium`, English messages, **no AI footer of any kind**.
7. Polish text with correct diacritics stays real HTML.
8. Palette: deep graphite, muted white, silver/cool highlights, sparse amber. No robot, glowing
   brain, purple AI gradient, HUD, particle storms, plastic blocks, uniform chrome. Silicon is
   not quartz, not diamond, not foil.

## Technical decisions

| Area | Decision |
|---|---|
| 3D layer | Three.js (current stable, pinned in lockfile), WebGL 2 only, lazy `import()` after content paints. `WebGL1` unsupported by the new layer; old renderer removed once hero ships. |
| Bundler | Vite. `npm run dev`, `npm run build` -> `dist/`, `npm run preview`. Keep relative asset paths. Code-split per scene. |
| Assets | Blender headless (LTS tarball in `~/tools/blender`, no sudo) driven by Python in `tools/blender/`. Outputs GLB (+ Draco or meshopt only if measured worthwhile), KTX2 only after quality check, else WebP/PNG. Posters WebP. Every script has a seed and a `make`-style command in `tools/README.md`. Build of the site never needs Blender. |
| Modules | `src/scripts/story/` (scroll reader, timeline, camera rig), `src/scripts/rendering/` (renderer, asset manager, quality controller), `src/scripts/scenes/*.js` (one per chapter). Keep file count honest: no module for one function. |
| Profiles | `cinematic`, `balanced`, `calm`. Selection: user preference > reduced-motion/save-data > measured frame times with hysteresis. `calm` = posters + DOM interactions, no flythroughs, no infinite ambient. |
| QA mode | `?scene=<id>&progress=<0..1>&quality=<profile>&freeze=1&seed=<n>` sets chapter, camera and ambient time deterministically. Documented in README. `freeze=1` stops the ambient clock. |
| Budgets | See brief §7 table. First mobile view <= 600 KiB, hero interactive <= 3 MiB mobile / 5 MiB desktop, full session <= 15 / 25 MiB. DPR cap 1.5 cinematic, 1.0 balanced. Textures 1K mobile / 2K desktop. |
| Fonts | Only fonts with a clear licence (e.g. Inter / Instrument Serif via Google Fonts files vendored, OFL), subset to Latin + Polish. Or stay system-font if the design holds. Decide in A3, document in ASSET_MANIFEST. |
| Reference hardware | This machine: NVIDIA RTX 3070 Laptop, Chrome. Record exact versions in `docs/PERFORMANCE.md`. |

## Stage A — audit and the first finished fragment (hero + entry into material)

### A1. Baseline, tooling, audit
- Use Node 22 (`nvm use 22`; `.nvmrc` exists). Run v0.1 with `npm run dev`.
- Playwright (Python, already installed) screenshots of all seven chapters at desktop 1440x1000
  and mobile 390x844, at progress 0.5, into `docs/qa/before/`. Short desktop scroll recording
  (Playwright video or ffmpeg of headed Chrome) into `docs/qa/before/`.
- Download Blender LTS tarball into `~/tools/blender/` (no sudo), verify `blender -b --version`.
  Record version in `tools/README.md`.
- Write `docs/qa/AUDIT.md`: concrete gaps of v0.1 versus the brief, per chapter, one line each.
  No essay. Also list every brief requirement that v0.1 already meets (keep those).
- Commit: baseline screenshots + audit + tools notes.

### A2. Hero assets (Blender, offline)
- `tools/blender/silicon_chunk.py`: procedural polycrystalline silicon chunk. Start from a
  coarse convex hull, cut with 8-14 seeded planes at varied angles for conchoidal-looking
  fracture faces, add low-frequency displacement to faces (curved fracture, not noise), light
  bevel on edges, then a high-res sculpt-like layer for micro-relief only where faces meet.
  Material: metallic ~0.9, roughness map 0.25-0.55 with directional striations on fracture
  faces, base colour cool grey-blue (#8a939c range), slight anisotropy on flat faces. Not
  mirror chrome. Verify from at least 6 camera angles and 3 light setups before export.
- Bake: normal map (OpenGL convention -> convert to glTF), roughness, subtle AO. 2K desktop,
  1K mobile variants. Runtime mesh <= 60k triangles; source `.blend` kept in `tools/blender/src/`
  and listed in ASSET_MANIFEST with size; if > 20 MiB, describe how to regenerate instead of
  committing it.
- Studio HDR: three-softbox setup rendered to a small equirect (1K, RGBE or HDR -> convert to
  `.hdr` for Three's RGBELoader, or bake a PMREM-friendly EXR). Check it also looks right
  when the chunk is still.
- Posters: hero desktop (1600x1000) and hero mobile (900x1400) rendered in Cycles from the
  same camera the Three.js scene uses at progress 0, so the handover has no jump. Export the
  camera as JSON (`tools/blender/out/hero_camera.json`) for the runtime.
- Second asset for the entry transition: a fracture-face close-up mesh or the same chunk with
  a higher-detail face region, so the camera can enter the surface without visible tessellation.
- Commit assets in `src/assets/models/` and `src/assets/textures/` with the manifest entries.

### A3. Runtime: Three.js, hero scene, entry transition, three profiles
- Add Vite + Three.js (pinned). Restructure scripts into the module layout above. Keep the
  text layer logic (chapter tracking, nav, motion button, transistor DOM state) working
  unchanged for the user.
- Hero scene: chunk GLB, HDR environment, key/fill/rim lights matching the poster, slow rotation
  (one turn ~ 90 s), pointer parallax <= 2 degrees, DPR cap per profile. Poster handover: keep
  the `<img>` visible until the first frame rendered with identical camera, then cross-fade
  over ~300 ms; no exposure jump (match tone mapping/exposure to the Cycles render by eye and
  by sampling a few pixels in QA).
- Entry into material: scroll from hero end to material start drives the camera along a spline
  toward a chosen fracture face; text fades out; the face fills the frame; cut/dissolve into
  the material chapter's first frame. Describe entry frame, movement, leading object, exit frame
  in `docs/ART_DIRECTION.md`. Mobile gets its own framing (safe area for the H1).
- Profiles: cinematic (2K textures, HDR, 1.5 DPR), balanced (1K, 1.0 DPR, no anisotropy),
  calm (poster only, no renderer import). Quality controller: measure real frame intervals,
  median/p95, hysteresis (two slow windows to demote, never promote automatically), ignore
  first shader compile and tab return.
- Robustness: hidden tab stops loop; context lost -> poster; asset error -> poster; JS off ->
  full story with posters.
- QA mode URL parameters implemented and documented.
- Update `tests/` to the new contract (do not delete tests to go green). Add a Playwright
  screenshot script `tests/screens.py` that captures hero at 0/25/50/75/100 for desktop and
  mobile in each profile and builds a comparison board (`docs/qa/after/hero-board.webp`).
- Recording: 30-60 s desktop scroll of hero -> material and a short mobile one. State the
  environment in `docs/qa/PREMIUM_REPORT.md` (start the file now, complete in D).
- Report: what changed in the image / proof / cost on weak hardware. Then stop for review.

Gate to Stage B: chunk convincing on a still frame, poster handover without a jump, camera
truly enters the surface, calm profile complete, budgets measured and written down.

## Stage B — transistor and scale
- Transistor: didactic cross-section GLB (substrate, oxide, gate, source/drain, contacts) with
  distinct believable materials, labelled, "uproszczony, nie w skali". State change shows a
  channel forming and a marked "umowna wizualizacja przepływu". Scroll triggers one demo;
  button and keyboard repeat it. Manual state survives small scroll moves.
- Scale: instanced microstructure (vias, interconnect layers, channels, repeated cells), camera
  spline with five control frames (entry, repetition detail, inside layers, complexity reveal,
  exit to chip). Test reverse scrolling, fast fling, mid-shot direction change. Text "To nie
  jest miasto…" appears after the perspective shift. LOD + instancing; no billions.

## Stage C — finale and remaining chapters
- Finale loop: chip -> device -> screen with a texture captured from the built site's hero
  (Playwright in `npm run build:screen`) mapped in perspective -> back to chunk -> Si/SI.
  No iframes, no auto-scroll.
- Material stages (01), world (04), AI demo (05): DOM-first, 3D or prerender only where it
  earns it. Test prerender seeking before committing to it.

## Stage D — production control
- Measurements (median/p95 frame time per profile, transfer per stage), asset-error and
  context-loss tests, reduced motion, no-JS, keyboard, 200% zoom, orientation.
- Docs: ART_DIRECTION, ASSET_MANIFEST, PERFORMANCE, SCIENCE, README, qa/PREMIUM_REPORT with
  environment and an explicit `NIEZWERYFIKOWANE` list (physical iPhone/Safari, low-end
  Android, integrated-GPU laptop) plus an owner checklist.
- Static build committed as verified command output, not as `dist/` in git.

## Reference: `references/concept.png` (992x1586 mood board, not a spec)

Take from it:
- Hero: near-black polycrystalline chunk with sharp, glossy conchoidal fracture faces, cool
  silver highlights, one warm amber rim accent, dark graphite background with a faint cool
  glow behind the object. Object right of centre, big serif headline left, element card
  "14 / Si, 28,085" as a thin technical annotation.
- Typography: large calm serif for headlines (e.g. Instrument Serif / Playfair-like), small
  spaced sans-serif caps for technical labels and eyebrows.
- Chapter 01: horizontal strip of five stages (quartz -> purified granules -> polycrystalline
  -> monocrystal ingot -> wafer), each a distinct believable material. This reads well as a
  DOM + small 3D/prerender strip; keep the labels.
- Chapter 02: transistor as a dark cube on a dark substrate with two sides showing 0 (cool
  blue) and 1 (amber) flows. Keep the colour code but the brief requires a real cross-section
  with labelled layers and a "umowna wizualizacja przepływu" note, not just a lit cube.
- Palette overall: graphite #0b0e12-ish, muted white text, silver, sparse amber.

Do NOT take (brief overrides the mood board):
- Chapter 03 literal city skyscrapers: brief §6/03 forbids it. Build microelectronic
  structure (vias, interconnect layers, channels, repeated cells) with the same monumental
  low-sun lighting and depth feel.
- "Ziarnko piasku ok. 1 mm" comparison and "zdjęcie rzeczywiste" thumbnail: no unjustified
  scale claims, no fake photos.
- Chapter 05 server hall + globe with network lines: brief wants prompt -> numbers -> ops ->
  hardware -> answer, no glowing globe. The chat-box UI element is fine as the DOM demo.
- Finale with man on a mountain: brief wants chip -> device -> screen showing krzem.si ->
  chunk -> Si/SI loop.
- "Sztuczna inteligencja istnieje dzięki krzemowi" style claims: SCIENCE.md limits apply.

## Open items (owner)
- None blocking. Physical device tests remain owner tasks (Stage D checklist).
