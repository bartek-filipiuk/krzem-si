# Offline tools

The site build never needs anything in this directory. These tools only regenerate assets.

## Blender

- Version: **Blender 5.2.2 LTS** (build hash `d13f752e3b9c`, build date 2026-09-15), official
  Linux x64 tarball `blender-5.2.2-linux-x64.tar.xz` from
  https://download.blender.org/release/Blender5.2/, SHA-256 checked against
  `blender-5.2.2.sha256` from the same directory.
- Install path on the reference machine (no sudo): `~/tools/blender/blender-5.2.2-linux-x64/`,
  with the symlink `~/tools/blender/blender` pointing to the binary. The tarball was deleted after
  extraction (1.2 GB extracted).
- Cycles GPU devices visible headless on the reference machine: OptiX and CUDA on
  NVIDIA GeForce RTX 3070 Laptop GPU (driver 580.178.04).

Reinstall elsewhere:

```bash
mkdir -p ~/tools/blender && cd ~/tools/blender
curl -LO https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz
curl -LO https://download.blender.org/release/Blender5.2/blender-5.2.2.sha256
grep linux-x64 blender-5.2.2.sha256 | sha256sum -c -
tar -xJf blender-5.2.2-linux-x64.tar.xz && rm blender-5.2.2-linux-x64.tar.xz
ln -sfn "$PWD/blender-5.2.2-linux-x64/blender" blender
./blender -b --version
```

Run a script headless (arguments after `--` go to the script's `sys.argv`):

```bash
~/tools/blender/blender -b -P tools/blender/<script>.py -- <args>
```

Add `--factory-startup` to ignore any local user preferences and add-ons.

## Hero chunk pipeline (stage A2)

Run from the repo root, one Blender process at a time (they share the GPU). `B` below means
`~/tools/blender/blender -b --factory-startup -P`. Times measured on the reference machine
(RTX 3070 Laptop, OptiX, 16 threads, 27 GB RAM). Order matters where noted.

| Output | Command | Time |
|---|---|---|
| `src/assets/env/studio-1k.hdr` | `B tools/blender/studio.py -- hdr` | 3 s |
| `src/assets/models/silicon-chunk-2k.glb`, `silicon-chunk-1k.glb`, `fracture-face.glb`, `tools/blender/out/entry-face.json`, `tools/blender/out/chunk-stats.json` | `B tools/blender/silicon_chunk.py` (`-- --seed 14` is the default) | 21 min |
| `src/assets/models/hero-camera.json` | `B tools/blender/studio.py -- camera` (after the chunk build: it reads `out/entry-face.json`) | 1 s |
| `src/assets/posters/hero-desktop.webp`, `hero-mobile.webp` | `B tools/blender/studio.py -- posters` (needs the 2K GLB and the HDR) | 23 s |
| `docs/qa/assets/chunk-turntable.webp` | `B tools/blender/studio.py -- sheet` | 38 s |
| `tools/blender/out/poses.webp` (QA: hero camera at 12 rotations, to choose `CHUNK_ROTATION_Z`) | `B tools/blender/studio.py -- poses` | 26 s |
| `tools/blender/out/rigcheck.webp` (QA: rig planes vs HDR world) | `B tools/blender/studio.py -- rigcheck` | 6 s |
| look-dev sheet of the procedural source (6 angles x 2 lights, no bake) | `B tools/blender/silicon_chunk.py -- --subdiv 8 --preview out.webp` | 5-6.5 min |
| `docs/qa/assets/chunk-in-three.webp` + handover metrics | `npm run build && npm run preview -- --port 4174`, then `python tests/screens.py handover`, copy `docs/qa/after/handover-desktop-canvas.webp` | 10 s |

The chunk build picks the entry face from the hero pose (`CHUNK_ROTATION_Z` in `studio.py`), so
after changing the pose rerun the chunk build, then `camera` and `posters`. The hero exposure
(`EXPOSURE_EV`) and the Three.js `environmentIntensity` (`ENV_INTENSITY_THREE`) also live in
`studio.py` and reach the runtime only through `camera`.
