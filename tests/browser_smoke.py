"""Real-browser smoke tests (Python + Playwright, Chromium).

Run against the built site:  npm run build && npm run preview   (port 4174), then
    python tests/browser_smoke.py
KRZEM_TEST_URL      base URL (default http://127.0.0.1:4174/)
KRZEM_GPU           nvidia (default) | amd | swiftshader  -- which GPU headless Chromium uses on
                    the reference laptop (see docs/qa/before/capture.py)
KRZEM_BROWSER_EXECUTABLE / KRZEM_BROWSER_ARGS customize the browser in CI.
Writes screenshots and browser-report.json to KRZEM_TEST_OUTPUT (default test-results/).
"""
from __future__ import annotations
import json
import os
import re
import shlex
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(os.environ.get('KRZEM_TEST_OUTPUT', 'test-results'))
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('KRZEM_TEST_URL', 'http://127.0.0.1:4174/')
GPU = os.environ.get('KRZEM_GPU', 'nvidia')
CHAPTERS = ['poczatek', 'materia', 'tranzystor', 'skala', 'swiat', 'inteligencja', 'fundament']
GPU_CHUNK = re.compile(r'renderer[-.][^/]*js|/three|\.glb|\.hdr')
results: list[dict] = []
errors: list[str] = []


def check(name: str, condition: bool) -> None:
    results.append({'name': name, 'passed': bool(condition)})
    assert condition, name


def attr(page, name: str):
    return page.locator('html').get_attribute(f'data-{name}')


def load(page, query: str = '', live: bool = True) -> list[str]:
    requests: list[str] = []
    page.on('request', lambda r: requests.append(r.url))
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL + query, wait_until='networkidle')
    if live:
        page.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=20000)
    page.wait_for_timeout(400)
    return requests


def goto_chapter(page, chapter: str, progress: float = .50) -> None:
    page.evaluate('''([id,p])=>{const el=document.getElementById(id);
      const y=el.getBoundingClientRect().top+scrollY;
      window.scrollTo(0,y+Math.max(0,el.offsetHeight-innerHeight)*p);
    }''', [chapter, progress])
    page.wait_for_timeout(150)


def fits(page) -> bool:
    return page.evaluate('document.documentElement.scrollWidth<=innerWidth')


def poster_shown(page) -> bool:
    return page.evaluate('''()=>{const img=document.querySelector('.hero-poster img'),s=getComputedStyle(img.parentElement);
      return img.complete&&img.naturalWidth>0&&s.visibility==='visible'&&Number(s.opacity)===1}''')


def gpu_error(page) -> int:
    return page.evaluate('document.querySelector("canvas").getContext("webgl2").getError()')


with sync_playwright() as p:
    options = {'headless': True, 'args': shlex.split(os.environ.get('KRZEM_BROWSER_ARGS', ''))}
    if GPU != 'swiftshader':
        options['args'] += ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist']
    if GPU == 'nvidia':
        options['env'] = dict(os.environ, __EGL_VENDOR_LIBRARY_FILENAMES='/usr/share/glvnd/egl_vendor.d/10_nvidia.json')
    if os.environ.get('KRZEM_BROWSER_EXECUTABLE'):
        options['executable_path'] = os.environ['KRZEM_BROWSER_EXECUTABLE']
    browser = p.chromium.launch(**options)

    desktop = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    load(desktop)
    check('Desktop: WebGL 2 renderer starts', attr(desktop, 'renderer') == 'webgl')
    check('Desktop: cinematic profile by default', attr(desktop, 'quality') == 'cinematic')
    desktop.wait_for_timeout(400)
    check('Desktop: poster hands over to the canvas', desktop.evaluate(
        "getComputedStyle(document.querySelector('.hero-poster')).visibility") == 'hidden')
    check('Desktop: no horizontal overflow', fits(desktop))
    desktop.screenshot(path=str(OUT / '01-desktop-hero.png'))
    for i, chapter in enumerate(CHAPTERS):
        goto_chapter(desktop, chapter, .85 if chapter in ['materia', 'skala', 'fundament'] else .5)
        check(f'Chapter {i}: scroll changes active scene', attr(desktop, 'chapter') == str(i))
        check(f'Chapter {i}: nav marks it aria-current', desktop.locator('.chapter-nav a').nth(i).get_attribute('aria-current') == 'step')
        check(f'Chapter {i}: GPU returns NO_ERROR', gpu_error(desktop) == 0)
        if chapter != 'poczatek':
            desktop.screenshot(path=str(OUT / f'{i+1:02d}-desktop-{chapter}.png'))
    goto_chapter(desktop, 'tranzystor')
    switch = desktop.locator('#transistor-toggle')
    before = switch.get_attribute('aria-pressed')
    switch.click()
    check('Transistor switches OFF/ON accessibly', switch.get_attribute('aria-pressed') != before)
    switch.click()
    check('Transistor switches back', switch.get_attribute('aria-pressed') == before)
    goto_chapter(desktop, 'inteligencja')
    ai = desktop.locator('#ai-toggle')
    before = ai.get_attribute('aria-expanded')
    ai.click()
    check('AI example opens/closes without network', ai.get_attribute('aria-expanded') != before)
    desktop.locator('#motion-toggle').click()
    desktop.wait_for_timeout(200)
    check('Motion OFF: static (calm) mode', attr(desktop, 'motion') == 'static' and attr(desktop, 'quality') == 'calm')
    check('Motion OFF: keeps current chapter', attr(desktop, 'chapter') == '5')
    check('Motion OFF: choice is persisted', desktop.evaluate("localStorage.getItem('krzem-motion')") == 'calm')
    desktop.screenshot(path=str(OUT / '08-static-ai.png'))
    desktop.locator('#motion-toggle').click()
    desktop.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=20000)
    check('Motion ON: renderer returns', attr(desktop, 'renderer') == 'webgl')
    check('Motion ON: keeps current chapter', attr(desktop, 'chapter') == '5')
    desktop.locator('.main-nav a[href="#materia"]').click()
    desktop.wait_for_timeout(200)
    check('Anchor navigation works', attr(desktop, 'chapter') == '1')
    desktop.locator('.main-nav a[href="#tranzystor"]').click()
    desktop.wait_for_timeout(200)
    desktop.go_back()
    desktop.wait_for_timeout(300)
    check('Back returns to the previous chapter', attr(desktop, 'chapter') == '1')
    desktop.go_forward()
    desktop.wait_for_timeout(300)
    check('Forward returns to the next chapter', attr(desktop, 'chapter') == '2')
    desktop.evaluate('document.querySelector("canvas").dispatchEvent(new Event("webglcontextlost",{cancelable:true}))')
    desktop.wait_for_timeout(150)
    check('Context loss event: readable static fallback', attr(desktop, 'renderer') == 'static')
    desktop.close()

    # Real context loss through WEBGL_lose_context, on the hero: poster, not a black frame.
    lost = browser.new_page(viewport={'width': 1440, 'height': 1000})
    load(lost)
    lost.evaluate("document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
    lost.wait_for_timeout(300)
    check('WEBGL_lose_context: static mode', attr(lost, 'renderer') == 'static')
    check('WEBGL_lose_context: hero poster visible again', poster_shown(lost))
    lost.screenshot(path=str(OUT / 'context-lost.png'))
    lost.close()

    # Missing GLB: poster and text, no black screen.
    missing = browser.new_page(viewport={'width': 1440, 'height': 1000})
    missing.route(re.compile(r'.*\.glb$'), lambda route: route.fulfill(status=404, body='missing'))
    warnings: list[str] = []
    missing.on('console', lambda m: warnings.append(m.text) if m.type == 'warning' else None)
    load(missing, live=False)
    missing.wait_for_timeout(800)
    check('GLB 404: static mode', attr(missing, 'renderer') == 'static' and attr(missing, 'motion') == 'static')
    check('GLB 404: hero poster visible', poster_shown(missing))
    check('GLB 404: logged once', sum('[krzem.si]' in w for w in warnings) == 1)
    missing.close()

    for name, viewport, config, expect in [
        ('mobile', {'width': 390, 'height': 844}, {'is_mobile': True, 'has_touch': True, 'device_scale_factor': 2}, 'webgl'),
        ('small-phone', {'width': 320, 'height': 640}, {'is_mobile': True, 'has_touch': True}, 'webgl'),
        ('landscape-phone', {'width': 844, 'height': 390}, {'is_mobile': True, 'has_touch': True}, 'webgl'),
        ('tablet', {'width': 1024, 'height': 768}, {}, 'webgl'),
        ('reduced-motion', {'width': 1440, 'height': 1000}, {'reduced_motion': 'reduce'}, 'static'),
        ('no-javascript', {'width': 1440, 'height': 1000}, {'java_script_enabled': False}, 'static'),
    ]:
        page = browser.new_page(viewport=viewport, **config)
        requests = load(page, live=expect == 'webgl')
        check(f'{name}: no horizontal overflow', fits(page))
        if expect == 'static':
            check(f'{name}: starts in static mode', attr(page, 'motion') == 'static')
            check(f'{name}: never downloads the GPU layer', not any(GPU_CHUNK.search(u) for u in requests))
            check(f'{name}: hero poster is the first frame', poster_shown(page))
        else:
            check(f'{name}: starts WebGL', attr(page, 'renderer') == 'webgl')
            check(f'{name}: motion control available', page.locator('#motion-toggle').is_visible())
        if name in ('small-phone', 'landscape-phone'):
            check(f'{name}: short screen picks compact framing, not a quality tier', attr(page, 'compact') == 'true' and attr(page, 'quality') == 'cinematic')
        page.screenshot(path=str(OUT / f'{name}.png'))
        for chapter in CHAPTERS:
            goto_chapter(page, chapter, .5)
            check(f'{name}/{chapter}: heading visible', page.locator(f'#{chapter} h1,#{chapter} h2').is_visible())
        page.close()

    # Explicit user choice beats reduced motion.
    chosen = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    chosen.add_init_script("localStorage.setItem('krzem-motion','motion')")
    load(chosen)
    check('User choice "motion" beats reduced motion', attr(chosen, 'quality') == 'cinematic')
    chosen.close()

    # QA mode and direct entry.
    qa = browser.new_page(viewport={'width': 1440, 'height': 1000})
    load(qa, '?scene=materia&progress=0.5&quality=balanced&freeze=1')
    check('QA mode: scene and progress', attr(qa, 'chapter') == '1' and abs(qa.evaluate('krzemDebug.progress') - .5) < .01)
    check('QA mode: forced profile', attr(qa, 'quality') == 'balanced')
    check('QA mode: frozen ambient clock', qa.evaluate('krzemDebug.ambient') == 0)
    requests = load(qa, '?quality=calm', live=False)
    check('QA calm: no GPU download', attr(qa, 'motion') == 'static' and not any(GPU_CHUNK.search(u) for u in requests))
    load(qa, '#materia')
    check('Direct load at #materia lands on the material chapter', attr(qa, 'chapter') == '1')
    qa.close()

    # Keyboard: skip link, then a chapter link with Enter.
    keys = browser.new_page(viewport={'width': 1440, 'height': 1000})
    load(keys)
    keys.keyboard.press('Tab')
    check('Keyboard: skip link is the first stop', keys.evaluate("document.activeElement.classList.contains('skip-link')"))
    keys.locator('.chapter-nav a[href="#skala"]').focus()
    keys.keyboard.press('Enter')
    keys.wait_for_timeout(300)
    check('Keyboard: Enter on a chapter link moves there', attr(keys, 'chapter') == '3')
    keys.close()

    # Attack: fast fling through the entry and back, direction change mid-transition, a hidden tab,
    # a resize across the mobile breakpoint and a burst of motion toggles.
    rough = browser.new_page(viewport={'width': 1440, 'height': 1000})
    load(rough, '?debug')
    rough.evaluate('''async()=>{const m=document.getElementById('materia').getBoundingClientRect().top+scrollY;
      const frame=()=>new Promise(r=>requestAnimationFrame(r));
      for(const y of [0,m*.5,m,m*.2,m*.8,m*.6,m,0,m*.7,m*.75,m*.72]){scrollTo(0,y);await frame();}}''')
    rough.wait_for_timeout(300)
    state = rough.evaluate('({hero:krzemDebug.hero,index:krzemDebug.index,dip:getComputedStyle(document.querySelector("canvas")).opacity})')
    check('Fling: state follows the last scroll position', state['index'] == 0 and abs(state['hero'] - .72) < .02)
    check('Fling: canvas opacity matches the entry phase', abs(float(state['dip']) - rough.evaluate(
        '(()=>{const t=krzemDebug.hero;const s=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x)};return t<.84?1-s((t-.74)/.1):s((t-.84)/.13)})()')) < .01)
    rough.evaluate('''()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'))}''')
    rough.wait_for_timeout(300)
    check('Hidden tab: loop stopped', rough.evaluate('krzemDebug.rafActive') is False)
    frozen = rough.evaluate('krzemDebug.ambient')
    rough.wait_for_timeout(500)
    check('Hidden tab: ambient clock paused', rough.evaluate('krzemDebug.ambient') == frozen)
    rough.evaluate('''()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
      document.dispatchEvent(new Event('visibilitychange'))}''')
    rough.wait_for_timeout(300)
    check('Tab return: loop resumes in the same state', rough.evaluate('krzemDebug.rafActive') and attr(rough, 'renderer') == 'webgl')
    rough.set_viewport_size({'width': 390, 'height': 844})
    rough.wait_for_timeout(300)
    check('Resize to phone: mobile framing, still WebGL', attr(rough, 'framing') == 'mobile' and attr(rough, 'renderer') == 'webgl')
    rough.set_viewport_size({'width': 1440, 'height': 1000})
    for _ in range(6):  # full -> calm -> full ... ends in full
        rough.locator('#motion-toggle').click()
    rough.wait_for_function("document.documentElement.dataset.hero==='live'", timeout=20000)
    rough.wait_for_timeout(500)
    check('Toggle burst: ends in one live renderer', attr(rough, 'motion') == 'full' and attr(rough, 'renderer') == 'webgl'
          and gpu_error(rough) == 0)
    rough.close()

    # Slow GPU simulated by a 50 ms busy wait in every frame: the controller must step down one
    # profile at a time (two slow windows each), keep the reader's place and never climb back.
    slow = browser.new_page(viewport={'width': 1440, 'height': 1000})
    slow.add_init_script('''(()=>{const raf=window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame=cb=>raf(t=>{const end=performance.now()+50;while(performance.now()<end);cb(t);});})()''')
    load(slow, '?debug')
    trail = slow.evaluate('''()=>new Promise(done=>{const seen=[document.documentElement.dataset.quality];const t0=performance.now();
      (function poll(){const q=document.documentElement.dataset.quality;if(q!==seen.at(-1))seen.push(q);
        if(q==='calm'||performance.now()-t0>20000)done({seen,ms:Math.round(performance.now()-t0),mode:document.documentElement.dataset.motion});
        else setTimeout(poll,100);})();})''')
    check('Slow frames: cinematic -> balanced -> calm, one step at a time', trail['seen'] == ['cinematic', 'balanced', 'calm'])
    check('Slow frames: demotion takes seconds, not one bad window', 3000 < trail['ms'] < 20000)
    check('Slow frames: calm keeps the story readable (static layout, poster)', trail['mode'] == 'static' and poster_shown(slow))
    slow.wait_for_timeout(3000)
    check('Slow frames: never promotes back', attr(slow, 'quality') == 'calm')
    slow.close()

    no_gpu = browser.new_page(viewport={'width': 1440, 'height': 1000})
    # Deliberately simulate blocked GPU access; this is not used in production.
    no_gpu.add_init_script('''(()=>{const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...rest){
      if(/webgl/.test(type))return null;return original.call(this,type,...rest);};})()''')
    load(no_gpu, live=False)
    no_gpu.wait_for_timeout(800)
    check('WebGL unavailable: static fallback', attr(no_gpu, 'renderer') == 'static')
    check('WebGL unavailable: poster shown', poster_shown(no_gpu))
    goto_chapter(no_gpu, 'tranzystor')
    check('WebGL unavailable: interaction still enabled', no_gpu.locator('#transistor-toggle').is_enabled())
    no_gpu.screenshot(path=str(OUT / 'no-webgl.png'))
    no_gpu.close()
    version = browser.version
    browser.close()
    check('No uncaught JavaScript errors', not errors)

report = {'url': URL, 'browser': f'Chromium {version}', 'gpu': GPU, 'checks': results, 'uncaught_errors': errors,
          'note': 'Viewport/device emulation is not a physical-device performance benchmark.'}
(OUT / 'browser-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(f'{len(results)} browser checks passed. Screenshots and report: {OUT.resolve()}')
