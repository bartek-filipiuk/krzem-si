"""2D finishing for Blender renders (system python3 + Pillow): poster background/glow, contact sheets.

  python3 compose.py poster in.png out.webp #0b0e12 cx cy radius glowhex alpha
  python3 compose.py sheet out.webp cols "label|label|..." tile1.png tile2.png ...
  python3 compose.py alpha in.png out.webp     # keep the alpha channel (page background shows through)
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

BG = "#0b0e12"


def rgb(hexstr):
    h = hexstr.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def background(w, h, bg, glow=None):
    """Flat graphite plus an optional soft radial glow, in display (sRGB) space like CSS would do."""
    img = np.broadcast_to(rgb(bg), (h, w, 3)).astype(np.float32)
    if glow:
        cx, cy, radius, color, alpha = glow
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.hypot(x / w - cx, (y - cy * h) / w) / radius   # radius relative to width
        a = alpha * np.clip(1 - d, 0, 1) ** 2
        img = img * (1 - a[..., None]) + rgb(color) * a[..., None]
    return img


def over(fg_path, bg_arr):
    fg = np.asarray(Image.open(fg_path).convert("RGBA"), dtype=np.float32)
    a = fg[..., 3:] / 255.0
    out = fg[..., :3] * a + bg_arr * (1 - a)
    # ponytail: 0.5 LSB triangular dither keeps the faint glow from banding in 8-bit WebP
    rng = np.random.default_rng(14)
    out += rng.triangular(-0.5, 0, 0.5, out.shape[:2])[..., None]
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def poster(src, dst, bg, cx, cy, radius, color, alpha, quality=86):
    w, h = Image.open(src).size
    img = over(src, background(w, h, bg, (float(cx), float(cy), float(radius), color, float(alpha))))
    img.save(dst, "WEBP", quality=int(quality), method=6)
    print(dst, img.size)


def alpha(src, dst, quality=86):
    img = Image.open(src).convert("RGBA")
    img.save(dst, "WEBP", quality=int(quality), alpha_quality=90, method=6)
    print(dst, img.size)


def sheet(dst, cols, labels, *tiles):
    cols = int(cols)
    labels = labels.split("|")
    ims = [over(t, background(*Image.open(t).size, BG)) for t in tiles]
    w, h = ims[0].size
    rows = -(-len(ims) // cols)
    board = Image.new("RGB", (cols * w, rows * h), BG)
    draw = ImageDraw.Draw(board)
    for i, im in enumerate(ims):
        x, y = (i % cols) * w, (i // cols) * h
        board.paste(im, (x, y))
        if i < len(labels):
            draw.text((x + 6, y + 4), labels[i], fill=(150, 158, 168))
    board.save(dst, "WEBP", quality=82, method=6)
    print(dst, board.size)


if __name__ == "__main__":
    {"poster": poster, "sheet": sheet, "alpha": alpha}[sys.argv[1]](*sys.argv[2:])
