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
