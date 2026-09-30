"""Baseline capture of the v0.1 prototype (stage A1). Not part of the test suite.

Run with the dev server up:  python docs/qa/before/capture.py [base_url]
Writes <chapter>-<desktop|mobile>.png and desktop-scroll-raw.webm next to this file;
PNG -> WebP and video re-encode are done with ffmpeg afterwards (see AUDIT.md).
GPU: headless Chromium, ANGLE on EGL, EGL vendor forced to NVIDIA (hybrid laptop);
without the env the browser picks the AMD iGPU.
"""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4174/'
OUT = Path(__file__).parent
CHAPTERS = ['poczatek', 'materia', 'tranzystor', 'skala', 'swiat', 'inteligencja', 'fundament']
ARGS = ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist']
ENV = dict(os.environ, __EGL_VENDOR_LIBRARY_FILENAMES='/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
           __NV_PRIME_RENDER_OFFLOAD='1', __GLX_VENDOR_LIBRARY_NAME='nvidia')
INFO = '''()=>{const g=document.createElement('canvas').getContext('webgl');
  const e=g&&g.getExtension('WEBGL_debug_renderer_info');const d=document.documentElement.dataset;
  return {renderer:d.renderer,quality:d.quality,chapter:d.chapter,
    gl:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,ua:navigator.userAgent,
    canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height]}}'''

def goto_chapter(page, chapter, progress=.5):  # same technique as tests/browser_smoke.py
    page.evaluate('''([id,p])=>{const el=document.getElementById(id);
      const y=el.getBoundingClientRect().top+scrollY;
      window.scrollTo(0,y+Math.max(0,el.offsetHeight-innerHeight)*p);}''', [chapter, progress])
    page.wait_for_timeout(700)  # let fades/transition settle

log = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=ARGS, env=ENV)
    for name, ctx in [('desktop', dict(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)),
                      ('mobile', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                                      is_mobile=True, has_touch=True))]:
        page = browser.new_page(**ctx)
        page.goto(URL, wait_until='networkidle'); page.wait_for_timeout(1500)
        for chapter in CHAPTERS:
            goto_chapter(page, chapter)
            page.screenshot(path=str(OUT / f'{chapter}-{name}.png'))
            log[f'{chapter}-{name}'] = page.evaluate(INFO)
        page.close()

    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1,
                              record_video_dir=str(OUT / 'video-tmp'), record_video_size={'width': 1440, 'height': 1000})
    page = ctx.new_page()
    page.goto(URL, wait_until='networkidle'); page.wait_for_timeout(2500)
    # Linear scroll top -> bottom over 30 s, one scrollTo per animation frame.
    page.evaluate('''()=>new Promise(done=>{const end=document.documentElement.scrollHeight-innerHeight,t0=performance.now();
      (function step(now){const k=Math.min(1,(now-t0)/30000);scrollTo(0,end*k);k<1?requestAnimationFrame(step):done();})(t0);})''')
    page.wait_for_timeout(2000)
    log['video'] = page.evaluate(INFO)
    video = page.video.path(); ctx.close()
    Path(video).rename(OUT / 'desktop-scroll-raw.webm'); (OUT / 'video-tmp').rmdir()
    log['browser'] = browser.version
    browser.close()
(OUT / 'capture-log.json').write_text(json.dumps(log, indent=1, ensure_ascii=False))
print(json.dumps({k: (v['renderer'], v['gl']) if isinstance(v, dict) else v for k, v in log.items()}, indent=1))
