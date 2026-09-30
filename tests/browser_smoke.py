"""Optional real-browser smoke tests and screenshots (Python + Playwright).

Run: python tests/browser_smoke.py
Default: tests the running local site at http://127.0.0.1:4173.
Offline: KRZEM_TEST_HTML=/path/to/krzem-preview.html python tests/browser_smoke.py
KRZEM_BROWSER_EXECUTABLE and KRZEM_BROWSER_ARGS customize the browser in CI.
"""
from __future__ import annotations
import json
import os
import shlex
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(os.environ.get('KRZEM_TEST_OUTPUT', 'test-results'))
OUT.mkdir(parents=True, exist_ok=True)
HTML = os.environ.get('KRZEM_TEST_HTML')
URL = os.environ.get('KRZEM_TEST_URL', 'http://127.0.0.1:4173/')
CHAPTERS = ['poczatek', 'materia', 'tranzystor', 'skala', 'swiat', 'inteligencja', 'fundament']
results: list[dict] = []
errors: list[str] = []

def check(name: str, condition: bool) -> None:
    results.append({'name': name, 'passed': bool(condition)})
    assert condition, name

def load(page) -> None:
    page.on('pageerror', lambda error: errors.append(str(error)))
    if HTML:
        page.set_content(Path(HTML).read_text(), wait_until='networkidle')
    else:
        page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(500)

def goto_chapter(page, chapter: str, progress: float = .50) -> None:
    page.evaluate('''([id,p])=>{const el=document.getElementById(id);
      const y=el.getBoundingClientRect().top+scrollY;
      window.scrollTo(0,y+Math.max(0,el.offsetHeight-innerHeight)*p);
    }''', [chapter, progress])
    page.wait_for_timeout(150)

def fits(page) -> bool:
    return page.evaluate('document.documentElement.scrollWidth<=innerWidth')

with sync_playwright() as p:
    options = {'headless': True, 'args': shlex.split(os.environ.get('KRZEM_BROWSER_ARGS', ''))}
    executable = os.environ.get('KRZEM_BROWSER_EXECUTABLE')
    if executable:
        options['executable_path'] = executable
    browser = p.chromium.launch(**options)
    desktop = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    load(desktop)
    check('Desktop: real WebGL renderer starts', desktop.locator('html').get_attribute('data-renderer') == 'webgl')
    check('Desktop: no horizontal overflow', fits(desktop))
    desktop.screenshot(path=str(OUT / '01-desktop-hero.png'))
    for i, chapter in enumerate(CHAPTERS):
        goto_chapter(desktop, chapter, .85 if chapter in ['materia', 'skala', 'fundament'] else .5)
        check(f'Chapter {i}: scroll changes active scene', desktop.locator('html').get_attribute('data-chapter') == str(i))
        check(f'Chapter {i}: GPU returns NO_ERROR', desktop.evaluate('document.querySelector("canvas").getContext("webgl").getError()') == 0)
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
    check('Motion OFF: static mode', desktop.locator('html').get_attribute('data-motion') == 'static')
    check('Motion OFF: keeps current chapter', desktop.locator('html').get_attribute('data-chapter') == '5')
    desktop.screenshot(path=str(OUT / '08-static-ai.png'))
    desktop.locator('#motion-toggle').click()
    desktop.wait_for_timeout(400)
    check('Motion ON: renderer returns', desktop.locator('html').get_attribute('data-renderer') == 'webgl')
    desktop.locator('.main-nav a[href="#materia"]').click()
    desktop.wait_for_timeout(150)
    check('Anchor navigation works', desktop.locator('html').get_attribute('data-chapter') == '1')
    desktop.evaluate('document.querySelector("canvas").dispatchEvent(new Event("webglcontextlost",{cancelable:true}))')
    desktop.wait_for_timeout(150)
    check('Context loss: readable static fallback', desktop.locator('html').get_attribute('data-renderer') == 'static')
    desktop.close()

    for name, viewport, config in [
        ('mobile', {'width': 390, 'height': 844}, {'is_mobile': True, 'has_touch': True}),
        ('small-phone', {'width': 320, 'height': 640}, {'is_mobile': True, 'has_touch': True}),
        ('tablet', {'width': 1024, 'height': 768}, {}),
        ('reduced-motion', {'width': 1440, 'height': 1000}, {'reduced_motion': 'reduce'}),
        ('no-javascript', {'width': 1440, 'height': 1000}, {'java_script_enabled': False}),
    ]:
        page = browser.new_page(viewport=viewport, device_scale_factor=1, **config)
        load(page)
        check(f'{name}: no horizontal overflow', fits(page))
        if name in ['small-phone', 'reduced-motion', 'no-javascript']:
            check(f'{name}: starts in static mode', page.locator('html').get_attribute('data-motion') == 'static')
        else:
            check(f'{name}: starts WebGL', page.locator('html').get_attribute('data-renderer') == 'webgl')
        page.screenshot(path=str(OUT / f'{name}.png'))
        for chapter in CHAPTERS:
            goto_chapter(page, chapter, .5)
            check(f'{name}/{chapter}: heading visible', page.locator(f'#{chapter} h1,#{chapter} h2').is_visible())
        if name == 'mobile':
            goto_chapter(page, 'inteligencja', .5)
            page.screenshot(path=str(OUT / 'mobile-ai.png'))
        page.close()

    no_gpu = browser.new_page(viewport={'width': 1440, 'height': 1000})
    # Deliberately simulate blocked GPU access; this is not used in production.
    patch = '''(()=>{const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...rest){
      if(/webgl/.test(type))return null;return original.call(this,type,...rest);};})()'''
    if HTML:
        no_gpu.evaluate(patch)
    else:
        no_gpu.add_init_script(patch)
    load(no_gpu)
    check('WebGL unavailable: static fallback', no_gpu.locator('html').get_attribute('data-renderer') == 'static')
    goto_chapter(no_gpu, 'tranzystor')
    check('WebGL unavailable: interaction still enabled', no_gpu.locator('#transistor-toggle').is_enabled())
    no_gpu.screenshot(path=str(OUT / 'no-webgl.png'))
    no_gpu.close()
    browser.close()
    check('No uncaught JavaScript errors', not errors)

report = {'mode': 'offline inlined production source' if HTML else URL,
          'browser': 'Chromium', 'checks': results, 'uncaught_errors': errors,
          'note': 'Viewport/device emulation is not a physical-device performance benchmark.'}
(OUT / 'browser-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(f'{len(results)} browser checks passed. Screenshots and report: {OUT.resolve()}')
