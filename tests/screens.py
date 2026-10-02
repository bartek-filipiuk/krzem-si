"""QA captures from the running site (not from Blender): progress screenshots, comparison boards,
poster handover pixel difference, frame timings, transfer sizes, scroll recordings, and the
chapter 01 lattice posters.

Serve the build first:  npm run build && npm run preview      (http://127.0.0.1:4174/)
    python tests/screens.py                       # everything on the NVIDIA GPU
    python tests/screens.py --gpu amd shots perf  # integrated AMD GPU: balanced shots + timings
Steps: shots, board, handover, perf, transfer, record (hero, stage A); lattice, lattice-perf,
lattice-record (hero -> lattice -> end of chapter 01); transistor, transistor-perf (chapter 02 OFF/ON);
scale, scale-perf, scale-record (chapter 03 flythrough, 02 -> 03 -> 04 recording);
posters (writes src/assets/posters/lattice-* and finfet-*).
Output: docs/qa/after/. The boards also take the AMD rows when they exist: run
`--gpu amd shots lattice perf lattice-perf` first, then the NVIDIA run.
"""
from __future__ import annotations
import argparse
import json
import os
import shutil
import statistics
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/qa/after'
URL = os.environ.get('KRZEM_TEST_URL', 'http://127.0.0.1:4174/')
PROGRESS = [0, .25, .5, .75, 1]
VIEWPORTS = {
    'desktop': dict(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1),
    'mobile': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True),
}
INFO = '''()=>{const g=document.querySelector('canvas').getContext('webgl2');const e=g&&g.getExtension('WEBGL_debug_renderer_info');
  const d=document.documentElement.dataset;return {gl:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,dpr:devicePixelRatio,
  viewport:[innerWidth,innerHeight],quality:d.quality,renderer:d.renderer,ua:navigator.userAgent,gpu:window.krzemDebug?.gpu??null}}'''


def launch(p, gpu):
    args = ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist']
    env = dict(os.environ)
    if gpu == 'nvidia':
        env['__EGL_VENDOR_LIBRARY_FILENAMES'] = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json'
    return p.chromium.launch(headless=True, args=args, env=env)


def ready(page, profile):
    if profile == 'calm':
        page.wait_for_function("document.documentElement.dataset.motion==='static'", timeout=20000)
    else:
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
        page.wait_for_timeout(1800)  # entry detail patch + a settled frame


def webp(png: Path, dst: Path, quality=82):
    Image.open(png).convert('RGB').save(dst, 'WEBP', quality=quality, method=6)


def shots(browser, gpu, profiles, frames=None, prefix='hero'):
    """frames: [(scene id, progress, file suffix[, extra query])]; default: the hero at PROGRESS."""
    frames = frames or [('poczatek', p, f'{int(p * 100):03d}') for p in PROGRESS]
    log = {}
    for profile in profiles:
        for name, ctx in VIEWPORTS.items():
            page = browser.new_page(**ctx)
            for scene, p, suffix, *extra in frames:
                page.goto(f'{URL}?scene={scene}&progress={p}&quality={profile}&freeze=1{"".join(extra)}', wait_until='networkidle')
                ready(page, profile)
                tag = f'{prefix}-{"amd-" if gpu == "amd" else ""}{profile}-{name}-{suffix}'
                with tempfile.NamedTemporaryFile(suffix='.png') as tmp:
                    page.screenshot(path=tmp.name)
                    webp(Path(tmp.name), OUT / f'{tag}.webp')
                log[tag] = page.evaluate(INFO)
            page.close()
    return log


BOARD_ROWS = [('cinematic · RTX 3070', 'hero-cinematic'), ('balanced · RTX 3070', 'hero-balanced'),
              ('balanced · AMD iGPU', 'hero-amd-balanced'), ('calm · poster', 'hero-calm')]


def board():
    """hero-board.webp: every profile/GPU row captured so far (run the amd shots first to include it)."""
    rows, h, cell = [], 250, 368
    for label, prefix in BOARD_ROWS:
        for name in VIEWPORTS:
            files = [OUT / f'{prefix}-{name}-{int(p * 100):03d}.webp' for p in PROGRESS]
            if all(f.exists() for f in files):
                rows.append((f'{label}\n{name}', [(t := Image.open(f)).resize((round(t.width * h / t.height), h)) for f in files]))
    img = Image.new('RGB', (190 + cell * len(PROGRESS), len(rows) * (h + 12) + 30), (11, 14, 18))
    draw = ImageDraw.Draw(img)
    for i, p in enumerate(PROGRESS):
        draw.text((190 + i * cell, 8), f'hero progress {p:.2f}', fill=(200, 200, 200))
    for r, (label, tiles) in enumerate(rows):
        y = 30 + r * (h + 12)
        draw.multiline_text((8, y + 110), label, fill=(210, 190, 150))
        for i, t in enumerate(tiles):
            img.paste(t, (190 + i * cell, y))
    img.save(OUT / 'hero-board.webp', 'WEBP', quality=80, method=6)


# Hero -> lattice handover (hero progress) and chapter 01 (pinned progress).
LATTICE_FRAMES = [('poczatek', p, f'h{int(p * 100):03d}') for p in (.76, .82, .88, .94)] + \
                 [('materia', p, f'{int(p * 100):03d}') for p in PROGRESS]
LATTICE_ROWS = [('cinematic · RTX 3070', 'lattice-cinematic'), ('balanced · RTX 3070', 'lattice-balanced'),
                ('balanced · AMD iGPU', 'lattice-amd-balanced'), ('calm · poster', 'lattice-calm')]


# Chapter 02 at 0-100 %, OFF then ON (power forced like a click on the switch).
TRANSISTOR_FRAMES = [('tranzystor', p, f'{state}-{int(p * 100):03d}', f'&power={state}') for state in ('off', 'on') for p in PROGRESS]
TRANSISTOR_ROWS = [(label, prefix.replace('lattice', 'transistor')) for label, prefix in LATTICE_ROWS]
# Chapter 03: progress 0/25/50/75/100 and the five control frames (scale-math.js KEYS: entry 0,
# repetition .16, inside the layers .3, reveal .6, the die corner .8, exit 1).
SCALE_FRAMES = [('skala', p, f'{round(p * 100):03d}') for p in (0, .16, .25, .3, .5, .6, .75, .8, 1)]
SCALE_ROWS = [(label, prefix.replace('lattice', 'scale')) for label, prefix in LATTICE_ROWS]
# Chapters 04 and 05 at 0/25/50/75/100 % (frozen: the chapter 05 demo shows its final state).
WORLD_FRAMES = [('swiat', p, f'{round(p * 100):03d}') for p in (0, .25, .5, .75, 1)]
WORLD_ROWS = [(label, prefix.replace('lattice', 'world')) for label, prefix in LATTICE_ROWS]
AI_FRAMES = [('inteligencja', p, f'{round(p * 100):03d}') for p in (0, .25, .5, .75, 1)]
AI_ROWS = [(label, prefix.replace('lattice', 'ai')) for label, prefix in LATTICE_ROWS]
# Chapter 06 at 0/25/50/75/100 plus the frame just before the match (.5): screen, then the real chunk.
FINALE_FRAMES = [('fundament', p, f'{round(p * 1000):04d}') for p in (0, .25, .4985, .5, .75, 1)]
FINALE_ROWS = [(label, prefix.replace('lattice', 'finale')) for label, prefix in LATTICE_ROWS]


def lattice_board(frames=None, rows_spec=None, name='lattice-board.webp', title=None):
    """lattice-board.webp: handover columns (hero .76-.94) then chapter 01 at 0-100 %. With other
    frames/rows (the transistor), the same layout for another chapter."""
    frames, rows_spec = frames or LATTICE_FRAMES, rows_spec or LATTICE_ROWS
    title = title or (lambda scene, p, suffix: f'{"hero" if scene == "poczatek" else "01 materia"} {p:.2f}')
    h, gap, label_w = 230, 8, 190
    rows = []
    for label, prefix in rows_spec:
        for name_ in VIEWPORTS:
            files = [OUT / f'{prefix}-{name_}-{f[2]}.webp' for f in frames]
            if all(f.exists() for f in files):
                rows.append((f'{label}\n{name_}', [(t := Image.open(f)).resize((round(t.width * h / t.height), h)) for f in files]))
    if not rows:
        return
    cell = max(t.width for _, tiles in rows for t in tiles) + gap
    img = Image.new('RGB', (label_w + cell * len(frames), len(rows) * (h + 12) + 30), (11, 14, 18))
    draw = ImageDraw.Draw(img)
    for i, (scene, p, suffix, *_) in enumerate(frames):
        draw.text((label_w + i * cell, 8), title(scene, p, suffix), fill=(200, 200, 200))
    for r, (label, tiles) in enumerate(rows):
        y = 30 + r * (h + 12)
        draw.multiline_text((8, y + 100), label, fill=(210, 190, 150))
        for i, t in enumerate(tiles):
            img.paste(t, (label_w + i * cell, y))
    img.save(OUT / name, 'WEBP', quality=80, method=6)


def posters(browser):
    """Calm/no-JS posters from the running scenes, page text hidden. Same pixel sizes as the hero
    posters (1600x1000 desktop, 900x1400 mobile). Chapter 01: the final monocrystal frame;
    chapter 02: the FinFET OFF and ON at the frame transistor-math.js POSTER names (progress .5);
    chapter 03: the reveal frame (progress .64)."""
    out = ROOT / 'src/assets/posters'
    shots_ = [('lattice', 'scene=materia&progress=1'), ('finfet-off', 'scene=tranzystor&progress=0.5&power=off'),
              ('finfet-on', 'scene=tranzystor&progress=0.5&power=on'), ('scale', 'scene=skala&progress=0.6'), ('world', 'scene=swiat&progress=0.775'), ('ai', 'scene=inteligencja&progress=0.4'), ('finale', 'scene=fundament&progress=1')]
    for name, ctx in {'desktop': dict(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1),
                      'mobile': dict(viewport={'width': 450, 'height': 700}, device_scale_factor=2, is_mobile=True, has_touch=True)}.items():
        page = browser.new_page(**ctx)
        for prefix, query in shots_:
            page.goto(f'{URL}?{query}&quality=cinematic&freeze=1', wait_until='networkidle')
            ready(page, 'cinematic')
            page.add_style_tag(content='main,.header,.chapter-nav,.reading-progress{visibility:hidden!important}')
            page.wait_for_timeout(300)
            with tempfile.NamedTemporaryFile(suffix='.png') as tmp:
                page.screenshot(path=tmp.name)
                webp(Path(tmp.name), out / f'{prefix}-{name}.webp', 84)
        page.close()


# The phone-like display in chapter 06 shows this capture of the page's own hero (70 x 148 mm,
# aspect .473 = 390 x 824). Regenerate with `npm run capture:screen` (see docs/ASSET_MANIFEST.md).
SCREEN_VIEWPORT = dict(viewport={'width': 390, 'height': 824}, device_scale_factor=2, is_mobile=True, has_touch=True)


def site_screen(browser):
    """src/assets/posters/site-hero-screen.webp: the built page's hero as a phone shows it, at rest."""
    page = browser.new_page(**SCREEN_VIEWPORT)
    page.goto(f'{URL}?scene=poczatek&progress=0&quality=cinematic&freeze=1', wait_until='networkidle')
    ready(page, 'cinematic')
    with tempfile.NamedTemporaryFile(suffix='.png') as tmp:
        page.screenshot(path=tmp.name)
        webp(Path(tmp.name), ROOT / 'src/assets/posters/site-hero-screen.webp', 86)
    page.close()


def before_after():
    """before-after-hero.webp: v0.1 hero (docs/qa/before) next to the new cinematic hero at progress 0."""
    before = ROOT / 'docs/qa/before'
    pairs = [('v0.1 desktop', before / 'poczatek-desktop.webp'), ('A3 desktop', OUT / 'hero-cinematic-desktop-000.webp'),
             ('v0.1 mobile', before / 'poczatek-mobile.webp'), ('A3 mobile', OUT / 'hero-cinematic-mobile-000.webp')]
    h = 600
    tiles = [(label, (t := Image.open(f).convert('RGB')).resize((round(t.width * h / t.height), h))) for label, f in pairs]
    img = Image.new('RGB', (sum(t.width for _, t in tiles) + 12 * (len(tiles) + 1), h + 44), (11, 14, 18))
    draw, x = ImageDraw.Draw(img), 12
    for label, t in tiles:
        draw.text((x, 12), label, fill=(210, 190, 150))
        img.paste(t, (x, 32))
        x += t.width + 12
    img.save(OUT / 'before-after-hero.webp', 'WEBP', quality=82, method=6)


def handover(browser):
    """Same frame twice: renderer live, then the poster forced back on top. Mean |diff| per pixel."""
    import numpy as np
    result = {}
    for name, ctx in VIEWPORTS.items():
        page = browser.new_page(**ctx)
        page.goto(f'{URL}?scene=poczatek&progress=0&quality=cinematic&freeze=1', wait_until='networkidle')
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
        page.wait_for_timeout(600)
        page.add_style_tag(content='.chapter-copy,.element-card,.scene-caption,.chapter-footer,.header,.chapter-nav,.reading-progress{visibility:hidden!important}')
        page.wait_for_timeout(200)
        with tempfile.TemporaryDirectory() as tmp:
            page.screenshot(path=f'{tmp}/canvas.png')
            page.evaluate("delete document.documentElement.dataset.hero")
            page.wait_for_timeout(200)
            page.screenshot(path=f'{tmp}/poster.png')
            page.add_style_tag(content='.hero-poster,#scene-canvas{visibility:hidden!important}')
            page.wait_for_timeout(200)
            page.screenshot(path=f'{tmp}/plate.png')
            plate = np.asarray(Image.open(f'{tmp}/plate.png').convert('RGB'), dtype=np.float32)
            a = np.asarray(Image.open(f'{tmp}/canvas.png').convert('RGB'), dtype=np.float32)
            b = np.asarray(Image.open(f'{tmp}/poster.png').convert('RGB'), dtype=np.float32)
            webp(Path(f'{tmp}/canvas.png'), OUT / f'handover-{name}-canvas.webp', 90)
            webp(Path(f'{tmp}/poster.png'), OUT / f'handover-{name}-poster.webp', 90)
        lum = lambda x: x @ np.array([.2126, .7152, .0722], dtype=np.float32)
        obj = np.abs(lum(b) - lum(plate)) > 4  # pixels where the poster shows the chunk, not the background
        diff = np.abs(a - b)
        h, w = obj.shape
        samples = {}
        ys, xs = np.nonzero(obj)
        for k in range(5):  # five fixed sample points spread over the chunk
            i = int(len(ys) * (k + .5) / 5)
            y, x = int(ys[np.argsort(ys * w + xs)][i]), int(xs[np.argsort(ys * w + xs)][i])
            samples[f'{x},{y}'] = {'canvas': a[y, x].round().tolist(), 'poster': b[y, x].round().tolist()}
        result[name] = {
            'mean_abs_diff_all': round(float(diff.mean()), 2),
            'mean_abs_diff_chunk': round(float(diff[obj].mean()), 2),
            'mean_luminance_chunk': {'canvas': round(float(lum(a)[obj].mean()), 2), 'poster': round(float(lum(b)[obj].mean()), 2)},
            'mean_luminance_background': {'canvas': round(float(lum(a)[~obj].mean()), 2), 'poster': round(float(lum(b)[~obj].mean()), 2)},
            'chunk_pixels': int(obj.sum()), 'samples': samples,
        }
        page.close()
    return result


# Fractions of the way from the hero top to `endAt` of the material chapter (0: it pins, 1: its end).
SCROLL = '''async ([segments,endAt=0])=>{const hero=document.getElementById('poczatek'),mat=document.getElementById('materia');
  const top=hero.getBoundingClientRect().top+scrollY,end=mat.getBoundingClientRect().top+scrollY+endAt*(mat.offsetHeight-innerHeight);
  for(const [a,b,ms] of segments){const t0=performance.now();
    await new Promise(done=>{(function step(now){const k=Math.min(1,(now-t0)/ms);scrollTo(0,top+(end-top)*(a+(b-a)*k));k<1?requestAnimationFrame(step):done();})(t0);});}}'''


def stats(xs):
    xs = sorted(xs)
    return {'frames': len(xs), 'median_ms': round(statistics.median(xs), 2) if xs else None,
            'p95_ms': round(xs[int(.95 * len(xs))], 2) if xs else None,
            'max_ms': round(xs[-1], 1) if xs else None, 'over_50ms': sum(x > 50 for x in xs)}


def perf(browser, gpu, profiles):
    out = {}
    for profile in profiles:
        for name, ctx in VIEWPORTS.items():
            page = browser.new_page(**ctx)
            page.goto(f'{URL}?quality={profile}&debug', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
            page.wait_for_timeout(2500)
            page.evaluate('krzemDebug.reset()')
            page.wait_for_timeout(4000)  # idle hero: ambient rotation only
            idle = page.evaluate('krzemDebug.intervals')
            page.evaluate('krzemDebug.reset()')
            # hero -> material over 8 s, hold, back halfway, forward again
            page.evaluate(SCROLL, [[[0, 1, 8000], [1, 1, 1000], [1, .4, 2500], [.4, 1, 2500]]])
            moving = page.evaluate('krzemDebug.intervals')
            gpu_ms = page.evaluate('krzemDebug.gpuMs') or []
            cpu = page.evaluate('krzemDebug.cpu')
            info = page.evaluate(INFO)

            out[f'{profile}/{name}'] = {'idle_hero': stats(idle), 'scroll_entry': stats(moving), 'gpu_time_scroll': stats(gpu_ms),
                                        'cpu_frame_median_ms': round(statistics.median(cpu), 3) if cpu else None,
                                        'gl': info['gl'], 'buffer': info['gpu']['buffer'] if info['gpu'] else None,
                                        'pixel_ratio': info['gpu']['pixelRatio'] if info['gpu'] else None}
            page.close()
    return out


def lattice_perf(browser, profiles):
    """Chapter 01: idle on the final monocrystal frame (ambient drift), then scrolling hero -> end of
    the chapter and back. GPU time per frame from EXT_disjoint_timer_query_webgl2."""
    out = {}
    for profile in profiles:
        for name, ctx in VIEWPORTS.items():
            page = browser.new_page(**ctx)
            page.goto(f'{URL}?quality={profile}&debug', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
            page.evaluate(SCROLL, [[[0, 1, 300]], 1])
            page.wait_for_timeout(2500)
            page.evaluate('krzemDebug.reset()')
            page.wait_for_timeout(4000)
            idle = page.evaluate('krzemDebug.intervals')
            idle_gpu = page.evaluate('krzemDebug.gpuMs') or []
            page.evaluate(SCROLL, [[[1, 0, 600]], 1])
            page.wait_for_timeout(1500)
            page.evaluate('krzemDebug.reset()')
            page.evaluate(SCROLL, [[[0, 1, 9000], [1, .5, 2500], [.5, 1, 2500]], 1])
            moving = page.evaluate('krzemDebug.intervals')
            gpu_ms = page.evaluate('krzemDebug.gpuMs') or []
            info = page.evaluate(INFO)
            out[f'{profile}/{name}'] = {'idle_lattice': stats(idle), 'gpu_time_idle': stats(idle_gpu), 'scroll': stats(moving),
                                        'gpu_time_scroll': stats(gpu_ms), 'gl': info['gl'],
                                        'buffer': info['gpu']['buffer'] if info['gpu'] else None,
                                        'lattice': info['gpu']['lattice'] if info['gpu'] else None}
            page.close()
    return out


def transistor_perf(browser, profiles):
    """Chapter 02: idle ON at progress .5 (carriers moving, depth-of-field pass), then a scroll
    through the whole chapter and back."""
    out = {}
    for profile in profiles:
        for name, ctx in VIEWPORTS.items():
            page = browser.new_page(**ctx)
            page.goto(f'{URL}?quality={profile}&debug&power=on', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
            page.evaluate(TO_CHAPTER, ['tranzystor', .5])
            page.wait_for_timeout(2500)
            page.evaluate('krzemDebug.reset()')
            page.wait_for_timeout(4000)
            idle, idle_gpu = page.evaluate('krzemDebug.intervals'), page.evaluate('krzemDebug.gpuMs') or []
            page.evaluate('krzemDebug.reset()')
            page.evaluate(SWEEP, ['tranzystor', [[0, 1, 6000], [1, .3, 2500], [.3, 1, 2500]]])
            moving, gpu_ms = page.evaluate('krzemDebug.intervals'), page.evaluate('krzemDebug.gpuMs') or []
            info = page.evaluate(INFO)
            out[f'{profile}/{name}'] = {'idle': stats(idle), 'gpu_time_idle': stats(idle_gpu), 'scroll': stats(moving),
                                        'gpu_time_scroll': stats(gpu_ms), 'gl': info['gl'],
                                        'buffer': info['gpu']['buffer'] if info['gpu'] else None}
            page.close()
    return out


TO_CHAPTER = '''([id,p])=>{const el=document.getElementById(id);scrollTo(0,el.getBoundingClientRect().top+scrollY+Math.max(0,el.offsetHeight-innerHeight)*p)}'''
# Pinned-progress sweep of one chapter: segments [from, to, ms].
SWEEP = '''async ([id,segments])=>{const el=document.getElementById(id),top=el.getBoundingClientRect().top+scrollY,span=Math.max(0,el.offsetHeight-innerHeight);
  for(const [a,b,ms] of segments){const t0=performance.now();
    await new Promise(done=>{(function step(now){const k=Math.min(1,(now-t0)/ms);scrollTo(0,top+span*(a+(b-a)*k));k<1?requestAnimationFrame(step):done();})(t0);});}}'''


def scale_perf(browser, profiles):
    """Chapter 03: idle at the reveal (ambient sway), then the whole flythrough and back."""
    out = {}
    for profile in profiles:
        for name, ctx in VIEWPORTS.items():
            page = browser.new_page(**ctx)
            page.goto(f'{URL}?quality={profile}&debug', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
            page.evaluate(TO_CHAPTER, ['skala', .6])
            page.wait_for_timeout(2500)
            page.evaluate('krzemDebug.reset()')
            page.wait_for_timeout(4000)
            idle, idle_gpu = page.evaluate('krzemDebug.intervals'), page.evaluate('krzemDebug.gpuMs') or []
            page.evaluate('krzemDebug.reset()')
            page.evaluate(SWEEP, ['skala', [[0, 1, 9000], [1, .3, 3000], [.3, .7, 2000]]])
            moving, gpu_ms = page.evaluate('krzemDebug.intervals'), page.evaluate('krzemDebug.gpuMs') or []
            info = page.evaluate(INFO)
            out[f'{profile}/{name}'] = {'idle': stats(idle), 'gpu_time_idle': stats(idle_gpu), 'scroll': stats(moving),
                                        'gpu_time_scroll': stats(gpu_ms), 'gl': info['gl'],
                                        'buffer': info['gpu']['buffer'] if info['gpu'] else None}
            page.close()
    return out


# Fractions of the way from 80 % of chapter 02 to the top of chapter 04.
SCALE_SCROLL = '''async ([segments])=>{const a=document.getElementById('tranzystor'),b=document.getElementById('swiat');
  const from=a.getBoundingClientRect().top+scrollY+(a.offsetHeight-innerHeight)*.8,to=b.getBoundingClientRect().top+scrollY+innerHeight*.3;
  for(const [p,q,ms] of segments){const t0=performance.now();
    await new Promise(done=>{(function step(now){const k=Math.min(1,(now-t0)/ms);scrollTo(0,from+(to-from)*(p+(q-p)*k));k<1?requestAnimationFrame(step):done();})(t0);});}}'''


def scale_record(p, gpu):
    """Desktop ~40 s: chapter 02 -> the whole of 03 -> start of 04, a reverse, a fling, a turn mid-shot."""
    browser = launch(p, gpu)
    ctx = VIEWPORTS['desktop']
    segments = [[0, 0, 1500], [0, .5, 12000], [.5, .82, 9000], [.82, .82, 1500], [.82, .35, 4000], [.35, .9, 900],
                [.9, .6, 2500], [.6, 1, 6000], [1, 1, 1500]]
    with tempfile.TemporaryDirectory() as tmp:
        context = browser.new_context(**ctx, record_video_dir=tmp, record_video_size=ctx['viewport'])
        page = context.new_page()
        page.goto(URL + '?debug&power=on', wait_until='networkidle')
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
        page.evaluate(SCALE_SCROLL, [[[0, 0, 10]]])
        page.wait_for_timeout(1500)
        page.evaluate('krzemDebug.reset()')
        page.evaluate(SCALE_SCROLL, [segments])
        measured = {'profile': page.evaluate('krzemDebug.profile'), **stats(page.evaluate('krzemDebug.intervals')),
                    'gpu_time': stats(page.evaluate('krzemDebug.gpuMs') or []), 'seconds': round(sum(ms for _, _, ms in segments) / 1000, 1)}
        video = page.video.path()
        context.close()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-c:v', 'libvpx-vp9', '-b:v', '0',
                        '-crf', '44', '-row-mt', '1', '-an', str(OUT / 'scale-scroll-desktop.webm')], check=True)
    browser.close()
    return measured


def device_perf(browser, profiles):
    """Chapters 04-05: idle on the exploded device with the live pi digits (04 at .3) and on the board with the demo open
    (05 at .4), then a scroll from the end of 03 to the start of 06 and back."""
    out = {}
    for profile in profiles:
        for name, ctx in VIEWPORTS.items():
            page = browser.new_page(**ctx)
            page.goto(f'{URL}?quality={profile}&debug', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
            row = {}
            for key, chapter, p in (('world', 'swiat', .3), ('ai', 'inteligencja', .4)):
                page.evaluate(TO_CHAPTER, [chapter, p])
                page.wait_for_timeout(2500)
                page.evaluate('krzemDebug.reset()')
                page.wait_for_timeout(4000)
                row[f'idle_{key}'] = stats(page.evaluate('krzemDebug.intervals'))
                row[f'gpu_time_idle_{key}'] = stats(page.evaluate('krzemDebug.gpuMs') or [])
            page.evaluate('krzemDebug.reset()')
            page.evaluate(DEVICE_SCROLL, [[[0, 1, 12000], [1, .4, 4000], [.4, .7, 2000]]])
            info = page.evaluate(INFO)
            out[f'{profile}/{name}'] = {**row, 'scroll': stats(page.evaluate('krzemDebug.intervals')),
                                        'gpu_time_scroll': stats(page.evaluate('krzemDebug.gpuMs') or []), 'gl': info['gl'],
                                        'buffer': info['gpu']['buffer'] if info['gpu'] else None}
            page.close()
    return out


# Fractions of the way from 85 % of chapter 03 to the top of chapter 06.
DEVICE_SCROLL = SCALE_SCROLL.replace("'tranzystor'", "'skala'").replace("'swiat'", "'fundament'").replace('*.8,', '*.85,')


def device_record(p, gpu):
    """Desktop ~45 s: end of 03 -> 04 (the device assembles) -> 05 (the demo opens on its own, runs,
    is closed and reopened by the button) -> start of 06, with a reverse back into 04."""
    browser = launch(p, gpu)
    ctx = VIEWPORTS['desktop']
    with tempfile.TemporaryDirectory() as tmp:
        context = browser.new_context(**ctx, record_video_dir=tmp, record_video_size=ctx['viewport'])
        page = context.new_page()
        page.goto(URL + '?debug', wait_until='networkidle')
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
        page.evaluate(DEVICE_SCROLL, [[[0, 0, 10]]])
        page.wait_for_timeout(1500)
        page.evaluate('krzemDebug.reset()')
        # Pinned layout: 04 spans about .23-.38 of this scroll, 05 .58-.74, its demo is open at .62-.68.
        page.evaluate(DEVICE_SCROLL, [[[0, .23, 3000], [.23, .38, 10000], [.38, .645, 5000]]])
        page.wait_for_timeout(5500)
        toggle = "document.querySelector('#ai-toggle').click()"
        page.evaluate(toggle); page.wait_for_timeout(1200)
        page.evaluate(toggle); page.wait_for_timeout(5500)
        page.evaluate(DEVICE_SCROLL, [[[.645, .3, 4000], [.3, .3, 1000], [.3, .645, 3000]]])
        page.wait_for_timeout(3000)
        page.evaluate(DEVICE_SCROLL, [[[.645, 1, 6000]]])
        page.wait_for_timeout(1500)
        measured = {'profile': page.evaluate('krzemDebug.profile'), **stats(page.evaluate('krzemDebug.intervals')),
                    'gpu_time': stats(page.evaluate('krzemDebug.gpuMs') or [])}
        video = page.video.path()
        context.close()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-c:v', 'libvpx-vp9', '-b:v', '0',
                        '-crf', '42', '-row-mt', '1', '-an', str(OUT / 'world-ai-scroll-desktop.webm')], check=True)
    browser.close()
    return measured


def finale_perf(browser, profiles):
    """Chapter 06: idle 4 s at the match (.5) and at rest (1), then the chapter from chapter 05's end and back."""
    out = {}
    for profile in profiles:
        for name, ctx in VIEWPORTS.items():
            page = browser.new_page(**ctx)
            page.goto(f'{URL}?quality={profile}&debug', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
            row = {}
            for key, p in (('match', .5), ('rest', 1)):
                page.evaluate(TO_CHAPTER, ['fundament', p]); page.wait_for_timeout(2500)
                page.evaluate('krzemDebug.reset()'); page.wait_for_timeout(4000)
                row[f'idle_{key}'] = stats(page.evaluate('krzemDebug.intervals'))
                row[f'gpu_time_idle_{key}'] = stats(page.evaluate('krzemDebug.gpuMs') or [])
            page.evaluate(TO_CHAPTER, ['inteligencja', .95]); page.wait_for_timeout(1500)
            page.evaluate('krzemDebug.reset()')
            page.evaluate(SWEEP, ['fundament', [[0, 1, 9000], [1, .3, 3000], [.3, .7, 2000]]])
            info = page.evaluate(INFO)
            out[f'{profile}/{name}'] = {**row, 'scroll': stats(page.evaluate('krzemDebug.intervals')),
                                        'gpu_time_scroll': stats(page.evaluate('krzemDebug.gpuMs') or []), 'gl': info['gl'],
                                        'buffer': info['gpu']['buffer'] if info['gpu'] else None}
            page.close()
    return out


# Scroll on by `screens` viewport heights over `ms` (out of chapter 06 into the sources).
SCROLL_ON = '''async ([screens, ms])=>{const t0=performance.now(),y0=scrollY;await new Promise(done=>{(function step(now){
  const k=Math.min(1,(now-t0)/ms);scrollTo(0,y0+innerHeight*screens*k);k<1?requestAnimationFrame(step):done();})(t0);});}'''


def finale_record(p, gpu):
    """Desktop ~45 s: end of 05 -> the whole of 06 (device, screen, match, rest) -> a reverse back
    before the match -> forward to rest -> on into the sources."""
    browser = launch(p, gpu)
    ctx = VIEWPORTS['desktop']
    with tempfile.TemporaryDirectory() as tmp:
        context = browser.new_context(**ctx, record_video_dir=tmp, record_video_size=ctx['viewport'])
        page = context.new_page()
        page.goto(URL + '?debug', wait_until='networkidle')
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
        page.evaluate(TO_CHAPTER, ['inteligencja', .7])
        page.wait_for_timeout(2000)
        page.evaluate('krzemDebug.reset()')
        page.evaluate(SWEEP, ['inteligencja', [[.7, 1, 2500]]])
        page.evaluate(SWEEP, ['fundament', [[0, .5, 9000], [.5, 1, 9000], [1, 1, 2000], [1, .3, 5000], [.3, .3, 800], [.3, 1, 7000], [1, 1, 2500]]])
        page.evaluate(SCROLL_ON, [1.2, 3000])
        page.wait_for_timeout(1000)
        measured = {'profile': page.evaluate('krzemDebug.profile'), **stats(page.evaluate('krzemDebug.intervals')),
                    'gpu_time': stats(page.evaluate('krzemDebug.gpuMs') or [])}
        video = page.video.path()
        context.close()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-c:v', 'libvpx-vp9', '-b:v', '0',
                        '-crf', '40', '-row-mt', '1', '-an', str(OUT / 'finale-scroll-desktop.webm')], check=True)
    browser.close()
    return measured


def transistor_record(p, gpu):
    """Desktop ~25 s: scroll into chapter 02 (the automatic ON demo), press OFF, ON, a quick double
    press, then the scroll on through the chapter and back."""
    browser = launch(p, gpu)
    ctx = VIEWPORTS['desktop']
    with tempfile.TemporaryDirectory() as tmp:
        context = browser.new_context(**ctx, record_video_dir=tmp, record_video_size=ctx['viewport'])
        page = context.new_page()
        page.goto(URL + '?debug', wait_until='networkidle')
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
        page.evaluate(TO_CHAPTER, ['tranzystor', 0])
        page.wait_for_timeout(1000)
        page.evaluate(SWEEP, ['tranzystor', [[0, .5, 4000]]])
        page.wait_for_timeout(2500)
        press = "document.querySelector('#transistor-toggle').click()"
        for wait in (2500, 2500, 300, 2500):
            page.evaluate(press)
            page.wait_for_timeout(wait)
        page.evaluate(SWEEP, ['tranzystor', [[.5, 1, 3500], [1, .3, 2500], [.3, .5, 1500]]])
        page.wait_for_timeout(1000)
        video = page.video.path()
        context.close()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-c:v', 'libvpx-vp9', '-b:v', '0',
                        '-crf', '40', '-row-mt', '1', '-an', str(OUT / 'transistor-switch-desktop.webm')], check=True)
    browser.close()


def lattice_record(p, gpu):
    """Desktop ~30 s: hero, entry into the face, dissolve into the lattice, the whole of chapter 01,
    back up into the hero and down again."""
    browser = launch(p, gpu)
    ctx = VIEWPORTS['desktop']
    segments = [[0, 0, 1500], [0, .45, 5000], [.45, .62, 5000], [.62, 1, 9000], [1, 1, 2000], [1, .4, 3500], [.4, .62, 2500], [.62, .9, 2500], [.9, .9, 1000]]
    with tempfile.TemporaryDirectory() as tmp:
        context = browser.new_context(**ctx, record_video_dir=tmp, record_video_size=ctx['viewport'])
        page = context.new_page()
        page.goto(URL + '?debug', wait_until='networkidle')
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
        page.wait_for_timeout(1500)
        page.evaluate('krzemDebug.reset()')
        # Fractions of hero top -> end of chapter 01; the hero alone is ~.45 of that distance.
        page.evaluate(SCROLL, [segments, 1])
        measured = {'profile': page.evaluate('krzemDebug.profile'), **stats(page.evaluate('krzemDebug.intervals')),
                    'gpu_time': stats(page.evaluate('krzemDebug.gpuMs') or []), 'seconds': round(sum(ms for _, _, ms in segments) / 1000, 1)}
        video = page.video.path()
        context.close()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-c:v', 'libvpx-vp9', '-b:v', '0',
                        '-crf', '44', '-row-mt', '1', '-an', str(OUT / 'lattice-scroll-desktop.webm')], check=True)
    browser.close()
    return measured


def transfer(browser):
    """Bytes per request from dist/: *_kib as a static host with the precompressed .br variants serves
    them (WebP has none), *_raw_kib uncompressed. vite preview itself does not send brotli."""
    dist = ROOT / 'dist'

    def size(url, raw=False):
        path = dist / urlparse(url).path.lstrip('/')
        if path.is_dir():
            path = path / 'index.html'
        if not path.exists():
            return 0
        br = Path(str(path) + '.br')
        return (br if br.exists() and not raw else path).stat().st_size
    out = {}
    for name, ctx in VIEWPORTS.items():
        page = browser.new_page(**ctx)
        seen: list[str] = []
        page.on('request', lambda r: seen.append(r.url))
        page.goto(URL, wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('.hero-poster img').complete", timeout=20000)
        first = [u for u in seen if not any(k in u for k in ('renderer', '.glb', '.hdr'))]
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
        live = list(seen)
        page.wait_for_timeout(5000)
        later = [u for u in seen if u not in live]
        # Lab only (localhost, no throttling): CLS is meaningful, LCP just shows what the LCP element is.
        vitals = page.evaluate('''()=>new Promise(r=>{let cls=0,lcp=null;
          new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)cls+=e.value}).observe({type:'layout-shift',buffered:true});
          new PerformanceObserver(l=>{const e=l.getEntries().at(-1);lcp={ms:Math.round(e.startTime),element:e.element?.tagName+'.'+(e.element?.className||e.element?.parentElement?.className)}}).observe({type:'largest-contentful-paint',buffered:true});
          setTimeout(()=>r({cls:Math.round(cls*1000)/1000,lcp}),200)})''')
        kib = lambda urls: round(sum(size(u) for u in set(urls)) / 1024, 1)
        raw = lambda urls: round(sum(size(u, True) for u in set(urls)) / 1024, 1)
        out[name] = {
            'first_view_kib': kib(first), 'first_view_raw_kib': raw(first), 'first_view': {urlparse(u).path: round(size(u) / 1024, 1) for u in set(first)},
            'hero_interactive_kib': kib(live), 'hero_interactive_raw_kib': raw(live), 'hero_interactive': {urlparse(u).path: round(size(u) / 1024, 1) for u in set(live)},
            'after_interactive': {urlparse(u).path: round(size(u) / 1024, 1) for u in set(later)},
            'after_interactive_kib': kib(later), 'after_interactive_raw_kib': raw(later),
            'lab_vitals': vitals,
        }
        page.close()
    return out


def record(p, gpu):
    """Desktop ~40 s and mobile ~15 s: hold, parallax, slow entry, fling back, turn mid-move.
    Returns the rendered-frame intervals measured during the recording (video capture included)."""
    browser = launch(p, gpu)
    measured = {}
    plans = {
        'desktop': (VIEWPORTS['desktop'], [[0, 0, 3000], [0, .6, 9000], [.6, .35, 1500], [.35, 1, 9000], [1, 1, 2500], [1, .1, 1200], [.1, .75, 3000], [.75, 1, 4000], [1, 1, 3000]]),
        'mobile': (VIEWPORTS['mobile'], [[0, 0, 1500], [0, 1, 7000], [1, .3, 1000], [.3, 1, 3500], [1, 1, 1500]]),
    }
    for name, (ctx, segments) in plans.items():
        with tempfile.TemporaryDirectory() as tmp:
            size = ctx['viewport']
            context = browser.new_context(**ctx, record_video_dir=tmp, record_video_size=size)
            page = context.new_page()
            page.goto(URL + '?debug', wait_until='networkidle')
            page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=30000)
            page.wait_for_timeout(1500)
            page.evaluate('krzemDebug.reset()')
            if name == 'desktop':
                for x, y in [(900, 400), (1100, 600), (700, 500), (1000, 450)]:
                    page.mouse.move(x, y, steps=40)
                    page.wait_for_timeout(400)
            page.evaluate(SCROLL, [segments])
            measured[name] = {'profile': page.evaluate('krzemDebug.profile'), **stats(page.evaluate('krzemDebug.intervals')),
                              'gpu_time': stats(page.evaluate('krzemDebug.gpuMs') or []),
                              'seconds': round(sum(ms for _, _, ms in segments) / 1000, 1)}
            video = page.video.path()
            context.close()
            dst = OUT / f'hero-scroll-{name}.webm'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-c:v', 'libvpx-vp9', '-b:v', '0',
                            '-crf', '42', '-row-mt', '1', '-an', str(dst)], check=True)
    browser.close()
    return measured


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--gpu', default='nvidia', choices=['nvidia', 'amd'])
    ap.add_argument('steps', nargs='*', default=['shots', 'board', 'handover', 'perf', 'transfer', 'record', 'lattice', 'lattice-perf', 'lattice-record', 'transistor', 'transistor-perf', 'scale', 'scale-perf', 'scale-record'])
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    log_path = OUT / f'capture-{a.gpu}.json'
    log = json.loads(log_path.read_text()) if log_path.exists() else {}
    profiles = ['balanced'] if a.gpu == 'amd' else ['cinematic', 'balanced', 'calm']
    with sync_playwright() as p:
        browser = launch(p, a.gpu)
        log['browser'] = f'Chromium {browser.version}'
        if 'shots' in a.steps:
            log['shots'] = shots(browser, a.gpu, profiles)
        if 'handover' in a.steps and a.gpu == 'nvidia':
            log['handover'] = handover(browser)
        if 'perf' in a.steps:
            log['perf'] = perf(browser, a.gpu, [x for x in profiles if x != 'calm'])
        if 'transfer' in a.steps and a.gpu == 'nvidia':
            log['transfer'] = transfer(browser)
        if 'lattice' in a.steps:
            log['lattice_shots'] = shots(browser, a.gpu, profiles, LATTICE_FRAMES, 'lattice')
        if 'transistor' in a.steps:
            log['transistor_shots'] = shots(browser, a.gpu, profiles, TRANSISTOR_FRAMES, 'transistor')
        if 'scale' in a.steps:
            log['scale_shots'] = shots(browser, a.gpu, profiles, SCALE_FRAMES, 'scale')
        if 'world' in a.steps:
            log['world_shots'] = shots(browser, a.gpu, profiles, WORLD_FRAMES, 'world')
        if 'ai' in a.steps:
            log['ai_shots'] = shots(browser, a.gpu, profiles, AI_FRAMES, 'ai')
        if 'finale' in a.steps:
            log['finale_shots'] = shots(browser, a.gpu, profiles, FINALE_FRAMES, 'finale')
        if 'finale-perf' in a.steps:
            log['finale_perf'] = finale_perf(browser, [x for x in profiles if x != 'calm'])
        if 'device-perf' in a.steps:
            log['device_perf'] = device_perf(browser, [x for x in profiles if x != 'calm'])
        if 'scale-perf' in a.steps:
            log['scale_perf'] = scale_perf(browser, [x for x in profiles if x != 'calm'])
        if 'transistor-perf' in a.steps:
            log['transistor_perf'] = transistor_perf(browser, [x for x in profiles if x != 'calm'])
        if 'lattice-perf' in a.steps:
            log['lattice_perf'] = lattice_perf(browser, [x for x in profiles if x != 'calm'])
        if 'site-screen' in a.steps and a.gpu == 'nvidia':
            site_screen(browser)
        if 'posters' in a.steps and a.gpu == 'nvidia':
            posters(browser)
        browser.close()
        if 'lattice' in a.steps or 'board' in a.steps:
            lattice_board()
        if 'scale' in a.steps or 'board' in a.steps:
            lattice_board(SCALE_FRAMES, SCALE_ROWS, 'scale-board.webp', lambda scene, p, suffix: f'03 {p:.2f}')
        if 'transistor' in a.steps or 'board' in a.steps:
            lattice_board(TRANSISTOR_FRAMES, TRANSISTOR_ROWS, 'transistor-board.webp', lambda scene, p, suffix: f'02 {suffix[:-4].upper()} {p:.2f}')
        if 'world' in a.steps or 'board' in a.steps:
            lattice_board(WORLD_FRAMES, WORLD_ROWS, 'world-board.webp', lambda scene, p, suffix: f'04 {p:.2f}')
        if 'finale' in a.steps or 'board' in a.steps:
            lattice_board(FINALE_FRAMES, FINALE_ROWS, 'finale-board.webp', lambda scene, p, suffix: '06 match' if suffix == '0500' else '06 before the match' if suffix == '0498' else f'06 {p:.2f}')
        if 'ai' in a.steps or 'board' in a.steps:
            lattice_board(AI_FRAMES, AI_ROWS, 'ai-board.webp', lambda scene, p, suffix: f'05 {p:.2f}')
        if 'board' in a.steps or 'shots' in a.steps:
            board()
            if (OUT / 'hero-cinematic-desktop-000.webp').exists():
                before_after()
        if 'record' in a.steps and a.gpu == 'nvidia':
            log['record'] = record(p, a.gpu)
        if 'transistor-record' in a.steps and a.gpu == 'nvidia':
            transistor_record(p, a.gpu)
        if 'scale-record' in a.steps and a.gpu == 'nvidia':
            log['scale_record'] = scale_record(p, a.gpu)
        if 'finale-record' in a.steps and a.gpu == 'nvidia':
            log['finale_record'] = finale_record(p, a.gpu)
        if 'device-record' in a.steps and a.gpu == 'nvidia':
            log['device_record'] = device_record(p, a.gpu)
        if 'lattice-record' in a.steps and a.gpu == 'nvidia':
            log['lattice_record'] = lattice_record(p, a.gpu)
    log_path.write_text(json.dumps(log, indent=1, ensure_ascii=False))
    print(json.dumps({k: v for k, v in log.items() if k in ('handover', 'perf', 'transfer', 'lattice_perf', 'lattice_record', 'transistor_perf', 'scale_perf', 'scale_record', 'device_perf', 'device_record', 'finale_perf', 'finale_record')}, indent=1)[:8000])
