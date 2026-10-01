# krzem.si — od materii do możliwości

Interaktywna opowieść o krzemie: siedem rozdziałów, natywny scroll, semantyczny HTML. Warstwa
tekstowa działa bez JavaScriptu i bez GPU. Nad nią, ładowana na żądanie, jest warstwa 3D na
Three.js (WebGL 2) z bryłką krzemu z pipeline'u Blendera.

**Status: etap A3 wersji premium + sieć krzemu w rozdziale 01.** Hero i wejście w materię są
zrobione na nowym rendererze; ściana bryłki przechodzi bez cięcia w sieć krystaliczną krzemu
generowaną w kodzie (`src/scripts/scenes/lattice*.js`), a rozdział 01 pokazuje porządkowanie
polikryształu w monokryształ. Rozdziały 02–06 nadal używają proceduralnych scen v0.1 (etapy B i C
je zastąpią). Projekt nie jest opublikowany na domenie.

## Uruchomienie

Node.js 22.12 lub nowszy (`.nvmrc`: 22).

```bash
npm ci
npm run dev        # http://127.0.0.1:4174 (Vite, hot reload)
npm run build      # dist/ (względne ścieżki, działa też w podkatalogu)
npm run preview    # podgląd dist/ na http://127.0.0.1:4174
npm test           # testy Node (story, kamera, profile, assety)
npm run verify     # kontrola źródeł + testy + build z budżetami
```

Port 4174, bo 4173 zajmuje inny projekt na maszynie referencyjnej. Build nie potrzebuje
Blendera: gotowe GLB, HDR, JSON kamery i postery leżą w `src/assets/`.

## Tryb QA

Parametry adresu ustawiają stan deterministycznie. To narzędzie do screenów, nie zamiennik
testu natywnego scrollowania.

```
?scene=<id>&progress=<0..1>&quality=<profil>&freeze=1&seed=<n>
```

- `scene`: id rozdziału (`poczatek`, `materia`, `tranzystor`, `skala`, `swiat`, `inteligencja`,
  `fundament`). Strona przewija się do tego miejsca po załadowaniu.
- `progress`: dla `poczatek` postęp hero od góry hero (0) do przypięcia rozdziału materii (1),
  czyli razem z przejściem do materii (0,79–0,98: sieć wyłania się z gasnącej ściany). Dla
  pozostałych rozdziałów postęp przypiętej sceny; `materia` 0 = ziarna polikryształu, 1 = kadr
  końcowy monokryształu wzdłuż [110] (ten sam co poster).
- `quality`: `cinematic`, `balanced` albo `calm`. Wymusza profil i wyłącza automatyczną degradację.
- `freeze=1`: zatrzymuje zegar ambientu i paralaksę; klatka jest rysowana tylko po scrollu/resize.
- `seed`: faza zegara ambientu: obrót bryłki i dryf kamery w sieci (0 = poza z posteru). Każda
  liczba daje zawsze tę samą fazę. Układ ziaren sieci ma stały seed (14), więc poster zawsze pasuje.
- `debug`: udostępnia `window.krzemDebug` (stan, profil, odstępy klatek `intervals`, czas GPU na
  klatkę `gpuMs` z `EXT_disjoint_timer_query_webgl2`, gdy przeglądarka go ma, diagnostyka GPU).
  Włącza się też samo przy `scene` lub `quality`.

Przykład: `http://127.0.0.1:4174/?scene=poczatek&progress=0.7&quality=balanced&freeze=1`.

## Profile i wydajność

- **cinematic** (domyślny): tekstury 2K na desktopie, 1K przy kadrze mobile, MSAA, DPR do 1,5.
- **balanced:** tekstury 1K, bez MSAA i anizotropii, DPR do 1,0 z limitem pikseli.
- **calm:** postery i pełna treść, bez Three.js (moduł nie jest nawet pobierany).

Kolejność wyboru: jawny wybór w przycisku „Ogranicz animacje / Włącz animacje” (zapamiętany
lokalnie) > `prefers-reduced-motion` i Save-Data > pomiar. Pomiar tylko obniża profil: mediana
i p95 odstępów między narysowanymi klatkami w oknach po 60 klatek lub 2 s, dwa wolne okna z rzędu
to jeden stopień w dół (cinematic → balanced → calm), nigdy w górę. Kompilacja shaderów, pierwsza
sekunda po powrocie do karty i przerwy dłuższe niż 250 ms nie są liczone. Szerokość ekranu,
liczba rdzeni i `deviceMemory` nie wpływają na profil. Niski ekran wybiera ciaśniejszy układ,
nie gorszą jakość.

Ukryta karta zatrzymuje pętlę. Utrata kontekstu WebGL, brak WebGL 2 albo błąd pobierania lub
dekodowania assetu kończy się posterem i tekstem, z jednym ostrzeżeniem w konsoli. Liczby,
budżety i pomiary: `docs/PERFORMANCE.md`, raport QA: `docs/qa/PREMIUM_REPORT.md`.

To mechanizmy ochronne, nie gwarancja 60 fps na każdym urządzeniu.

## Testy przeglądarkowe i screeny

Wymagany Python z Playwright (Chromium) i Pillow. Najpierw `npm run build && npm run preview`, potem:

```bash
python tests/browser_smoke.py          # asercje: WebGL, rozdziały, nawigacja, fallbacki, QA mode
python tests/screens.py                # screeny hero 0/25/50/75/100 %, plansza, przejęcie posteru,
                                       # czasy klatek, transfer, nagrania -> docs/qa/after/
python tests/screens.py --gpu amd shots perf   # zintegrowane GPU AMD (balanced); uruchom przed
                                               # przebiegiem NVIDIA, wtedy plansza ma też wiersz AMD
python tests/screens.py lattice lattice-perf lattice-record   # przejście hero -> sieć i rozdział 01:
                                       # lattice-board.webp, czasy GPU, lattice-scroll-desktop.webm
python tests/screens.py posters        # postery rozdziału 01 z działającej sceny -> src/assets/posters/
```

Na laptopie referencyjnym headless Chromium renderuje na RTX 3070 tylko z
`__EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/10_nvidia.json` (skrypty ustawiają
to same, `KRZEM_GPU=amd` albo `--gpu amd` wybiera iGPU). `KRZEM_TEST_URL` zmienia adres.

## Deploy

Wdróż **zawartość `dist/`** na dowolnym hostingu statycznym. Build: `npm ci && npm run build`;
output: `dist`. Nie ma backendu ani sekretów. Pliki `.br` i `.gz` są gotowymi wariantami kompresji.

Canonical, Open Graph i sitemap mają domyślnie adres `https://krzem.si/`. Inny adres:

```bash
SITE_URL=https://example.com/ npm run build
```

**Uwaga, CSP w `deploy/Caddyfile`:** nagłówek ma `connect-src 'none'` i `img-src 'self' data:`.
Warstwa 3D pobiera GLB/HDR przez `fetch()`, a GLTFLoader dekoduje osadzone tekstury z adresów
`blob:`. Z tym nagłówkiem hero w kontenerze Caddy zostanie na posterze (strona działa, ale bez
3D). Zmiana CSP czeka na decyzję właściciela, szczegóły w `docs/qa/PREMIUM_REPORT.md`.

### Docker / Hetzner / reverse proxy

```bash
docker compose up --build -d
# http://127.0.0.1:8080
```

Kontener jest związany z localhost hosta. Caddy w kontenerze serwuje HTTP; TLS i DNS należą do
zewnętrznego reverse proxy. Przykład bez kontenera: `deploy/Caddyfile.host`. Dockerfile nie był
uruchamiany w tym etapie.

### GitHub Pages

Ręczny workflow `.github/workflows/pages.yml` (Settings → Pages → źródło GitHub Actions). Ścieżki
są względne, więc strona działa też w podkatalogu repo. Wrzucenie kodu nie publikuje strony; CI
wykonuje tylko `npm ci` i `npm run verify`.

## Pliki

- `src/index.html`, `src/styles.css`: treść, dostępność, układ, postery.
- `src/scripts/app.js`: warstwa tekstowa, wybór profilu, jedyna pętla `requestAnimationFrame`.
- `src/scripts/story/`: `timeline.js` (scroll → rozdział, postęp, fazy przejścia),
  `camera-rig.js` (czysta funkcja pozy kamery).
- `src/scripts/rendering/`: `renderer.js` (warstwa GPU, ładowana leniwie), `assets.js`
  (współdzielone, anulowalne ładowanie i zwalnianie), `quality.js` (profile i kontroler).
- `src/scripts/scenes/`: `hero.js` (bryłka), `lattice.js` + `lattice-math.js` (sieć krzemu, rozdział 01;
  matematyka sieci testowana w Node), `legacy*.js` (sceny v0.1 rozdziałów 02–06).
- `src/assets/`: modele, HDR, JSON kamery i postery z etapu A2 (`docs/ASSET_MANIFEST.md`).
- `tools/`: pipeline Blendera (niepotrzebny do builda). `scripts/art/`: odtwarzanie posterów v0.1.
- `tests/`: testy Node, smoke w Playwright, screeny i nagrania.

## Materiały i licencja

Bryłka, HDR i postery powstają w projekcie (Blender, skrypty w `tools/blender/`). Three.js jest
na licencji MIT. Fonty: systemowe (decyzja w `docs/ASSET_MANIFEST.md`). Źródła merytoryczne są
w stopce strony oraz `docs/SCIENCE.md`.

Nie wybrano jeszcze licencji open source. `private: true` w package.json chroni przed
przypadkowym opublikowaniem paczki npm.
