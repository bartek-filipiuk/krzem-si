# Raport QA premium: etap A (hero + wejście w materię)

Stan na 30 września 2026, gałąź `premium`. Dotyczy tylko rozdziału 00 (hero) i przejścia do
rozdziału 01. Rozdziały 01–06 nadal używają scen v0.1 (etapy B i C).

## Co zmieniło się w obrazie względem v0.1

- Proceduralna, beżowo-brązowa bryłka v0.1 z widoczną siatką trójkątów zastąpiona modelem z
  Blendera: szary, metaliczny krzem polikrystaliczny z przełamami, rysami i drobnym ziarnem,
  oświetlony studiem z HDR (cztery softboxy), tone mapping Khronos PBR Neutral.
- Poza bryłki 120°: do kamery szeroka szara ściana przełamu z długą rysą. Kadr desktop odsunięty
  (bryłka wolna od karty „14 / Si”), kadr mobile osobny: bryłka pod H1 i linkiem „Odkryj”.
- Poster z Cycles jest pierwszą klatką; renderer rysuje tę samą klatkę i poster znika w 300 ms.
- Wejście w materię: kamera zatacza łuk do ściany przełamu, tekst hero wygasa, ściana z rysą
  wypełnia kadr (łatka `fracture-face.glb`), obraz gaśnie do grafitu i następuje cięcie do
  rozdziału 01. Cofanie scrolla odtwarza te same klatki.
- Trzy profile: cinematic, balanced, calm (poster, bez Three.js).

Dowody: `docs/qa/after/before-after-hero.webp` (v0.1 kontra A3, desktop i mobile),
`docs/qa/after/hero-board.webp` (postęp 0 / 0,25 / 0,5 / 0,75 / 1 × profile × GPU × kadry),
`docs/qa/after/hero-scroll-desktop.webm` (44 s) i `hero-scroll-mobile.webm` (18 s).

## Środowisko

| | |
|---|---|
| Maszyna | laptop referencyjny, Linux 6.8.0-138-generic (Ubuntu 22.04) |
| Przeglądarka | Chromium 145.0.7632.6 headless (Playwright 1.58.0, Python) |
| Akceleracja | `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist`; wybór GPU przez `__EGL_VENDOR_LIBRARY_FILENAMES` |
| GPU 1 (dyskretne) | NVIDIA GeForce RTX 3070 Laptop, sterownik 580.178.04; GL: `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3070 Laptop GPU/PCIe/SSE2, OpenGL ES 3.2)` |
| GPU 2 (zintegrowane) | AMD Cezanne/Renoir iGPU, Mesa 23.2.1 (amdgpu); GL: `ANGLE (AMD, RENOIR (renoir LLVM 15.0.7), OpenGL ES 3.2)` |
| Viewport desktop | 1440×1000, DPR 1 |
| Viewport mobile | 390×844, DPR 2, emulacja `is_mobile` + dotyk (to nie jest telefon) |
| Odświeżanie | headless, requestAnimationFrame ograniczone do 60 Hz |
| Node / npm build | Node v22.20.0, Vite 8.3.1, Three.js 0.186.1 (lockfile) |
| Assety | Blender 5.2.2 LTS (postery, kamera; build bryłki z A2 nie był powtarzany) |
| Serwer | `vite preview` na porcie 4174 z `dist/` po `npm run build` |

## Co mierzono i jak

| Pomiar | Narzędzie | Wynik (plik) |
|---|---|---|
| Screeny hero 0/25/50/75/100 %, desktop i mobile, cinematic i balanced (RTX), balanced (AMD), calm | `python tests/screens.py --gpu amd shots perf`, potem `python tests/screens.py` | `docs/qa/after/hero-*.webp`, plansza `hero-board.webp` |
| Przed/po | ten sam skrypt, v0.1 z `docs/qa/before/poczatek-*.webp` | `before-after-hero.webp` |
| Przejęcie posteru | krok `handover`: ta sama zamrożona klatka z canvasem i z posterem, różnica pikseli i luminancja | `capture-nvidia.json` → `handover`, `handover-*.webp` |
| Czasy klatek | krok `perf`: odstępy między narysowanymi klatkami (`krzemDebug.intervals`) i czas GPU na klatkę (`EXT_disjoint_timer_query_webgl2`, `krzemDebug.gpuMs`) | `capture-*.json` → `perf`, `record` |
| Transfer | krok `transfer`: żądania świeżej strony do „hero live” + 5 s, rozmiary z `dist/` (brotli z plików `.br` i surowe) | `capture-nvidia.json` → `transfer` |
| Lab LCP / CLS | PerformanceObserver w tym samym kroku | `capture-nvidia.json` → `transfer.*.lab_vitals` |
| Nagrania | Playwright `record_video_dir`, skryptowany scroll, VP9 CRF 42 | `hero-scroll-desktop.webm`, `hero-scroll-mobile.webm` |
| Odporność | `python tests/browser_smoke.py` (RTX i AMD) | `docs/qa/browser-report.json` |

Nagranie desktop (44 s): 3 s spoczynku, ruch myszy (paralaksa), wolny scroll do 60 % hero przez
9 s, cofnięcie do 35 %, wolno do materii (9 s), postój, szybki fling wstecz do 10 % w 1,2 s,
wejście do 75 % i dokończenie, postój. Mobile (18 s): spoczynek, scroll do materii w 7 s, fling
wstecz do 30 %, ponownie do materii.

## Wyniki

### Przejęcie posteru (RTX, cinematic, klatka zamrożona)

| Kadr | Luminancja bryłki canvas / poster | Tło canvas / poster | Średnia różnica na bryłce / całej klatce |
|---|---|---|---|
| desktop | 83,7 / 84,0 | 14,9 / 15,2 | 9,75 / 1,73 |
| mobile | 93,9 / 93,7 | 14,7 / 15,1 | 16,66 / 2,62 |

Brak skoku ekspozycji: jasność bryłki różni się o 0,3 (desktop) i 0,2 (mobile) na 255. Po zmianie
pozy trzeba było podnieść `environmentIntensity` z 1,35 do 1,65 (przy 1,35 canvas był ciemniejszy
o 11 punktów). Pozostała różnica per piksel to struktura (odbicia wzajemne w Cycles, smugi, drobne
refleksy). CLS w oknie z przejęciem: 0 (desktop i mobile).

### Czasy klatek (ms)

Mediana / p95 odstępów między narysowanymi klatkami w czasie skryptowanego przejazdu hero →
materia i z powrotem, oraz czas GPU na klatkę. Pełna tabela z biegiem jałowym: `docs/PERFORMANCE.md`.

| GPU | Profil / kadr | Odstępy mediana / p95 / max | > 50 ms | GPU mediana / p95 |
|---|---|---|---|---|
| RTX 3070 | cinematic / desktop | 16,7 / 16,7 / 33,3 | 0 | 2,38 / 4,16 |
| RTX 3070 | cinematic / mobile | 16,7 / 16,7 / 33,3 | 0 | 1,58 / 4,89 |
| RTX 3070 | balanced / desktop | 16,7 / 16,7 / 33,3 | 0 | 0,59 / 2,02 |
| RTX 3070 | balanced / mobile | 16,7 / 16,8 / 33,3 | 0 | 0,38 / 2,34 |
| AMD iGPU | balanced / desktop | 16,7 / 16,7 / 16,8 | 0 | 0,66 / 6,85 |
| AMD iGPU | balanced / mobile | 16,7 / 16,7 / 33,3 | 0 | 0,50 / 2,85 |
| AMD iGPU | cinematic / desktop | 16,7 / 16,7 / 33,4 | 0 | 1,51 / 7,71 |
| AMD iGPU | cinematic / mobile | 16,7 / 16,7 / 33,3 | 0 | 0,83 / 5,26 |

W czasie nagrań (RTX, cinematic, z przechwytywaniem wideo): desktop 2437 klatek, 16,7 / 16,7 /
max 33,4 ms, GPU 1,03 / 2,59 ms; mobile 874 klatki, 16,7 / 16,8 / max 33,3 ms, GPU 1,39 / 3,32 ms.

Interpretacja: w laboratorium żaden profil na żadnym z dwóch GPU nie zgubił rytmu 60 Hz. Odstępy
są przycięte do 60 Hz przez headless Chromium, dlatego zapas pokazuje czas GPU: na AMD iGPU w
cinematic desktop p95 to 7,7 ms, około połowy klatki.

### Transfer (pusty cache)

| Zakres (brief §7) | Budżet | Brotli | Surowe | Wynik |
|---|---|---|---|---|
| Pierwszy czytelny widok mobile | ≤ 600 KiB | 101,3 KiB | 133,7 KiB | spełniony |
| Pierwszy widok desktop (informacyjnie) | — | 104,9 KiB | 137,4 KiB | — |
| Hero interaktywne mobile | ≤ 3 MiB | 1011,0 KiB | 1962,8 KiB | spełniony |
| Hero interaktywne desktop | ≤ 5 MiB | 2323,4 KiB | 3695,2 KiB | spełniony |
| Łatka wejścia (po przejęciu) | — | 495,7 KiB | 692,8 KiB | — |
| Pełna sesja (górna granica: cały `dist/` dla kadru) | ≤ 15 / 25 MiB | 1686,6 / 2999,0 KiB | 2835,5 / 4567,9 KiB | spełniony |
| DPR | 1,5 / 1,0 | cinematic mobile bufor 585×1266 (1,5), balanced 390×844 (1,0) | | spełniony |
| Jeden renderer | 1 | jeden canvas, jeden kontekst WebGL 2 | | spełniony |

Brotli to pliki `.br` z `dist/`, które serwuje Caddy (`precompressed br gzip`). Pierwszy widok
obejmuje też posterki rozdziałów 01–02, które przeglądarka dociąga z `loading="lazy"` (w jednym z
przebiegów także 03: 209,6 KiB desktop, nadal w budżecie).

### Lab LCP / CLS (localhost, bez dławienia)

| Kadr | LCP | Element | CLS |
|---|---|---|---|
| desktop | 108 ms | H1 hero | 0 |
| mobile | 92 ms | H1 hero | 0 |

To wynik laboratoryjny. Nie przewiduje terenowego LCP na telefonie w sieci komórkowej.

### Odporność (Chromium, RTX i AMD)

`tests/browser_smoke.py`: 129/129 asercji na RTX, 129/129 na AMD, zero nieobsłużonych błędów JS.
Sprawdzone między innymi: wymuszony profil w trybie QA, wybór „motion” wygrywa z reduced motion
(pełna kolejność z Save-Data i histereza: testy Node), symulowane wolne GPU (50 ms na klatkę):
cinematic → balanced → calm po jednym stopniu, bez powrotu, ukryta karta zatrzymuje pętlę i zegar
ambientu, powrót wznawia, `WEBGL_lose_context` → poster, 404 na GLB → poster i jedno ostrzeżenie,
brak WebGL → poster, JS wyłączony → pełna treść z posterem, bez pobierania warstwy GPU, reduced
motion → calm bez Three.js, wejście bezpośrednie na `#materia`, Back/Forward, klawiatura (skip
link, Enter na linku rozdziału), szybki fling i zmiana kierunku w połowie przejścia, resize przez
próg mobile, seria przełączeń animacji, brak poziomego przewijania na 320, 390, 844 (poziomo),
1024 i 1440 px. Testy Node: 20/20.

## Zmiany w kodzie etapu A3 (ta iteracja)

- `tools/blender/studio.py`, `hero-camera.json`, postery: poza 120°, nowe kadry, poświata posteru
  przesunięta za bryłkę (także w CSS), `environmentIntensity` 1,65; ściana wejścia wybierana w
  osobnym, stałym układzie (`ENTRY_PICK`), więc ponowny build bryłki wybierze tę samą ścianę.
- `src/scripts/scenes/hero.js`: w dojeździe studio obraca się do układu światła ściany wejścia
  (`entryFace.lightRotationY`), kamera kończy na normalnej ściany, ekspozycja łagodnie spada do
  ×0,49 (przy s = 0 bez zmian, więc poster się zgadza). Wcześniej ściana przepalała się do bieli.
- `src/styles.css`: miękka grafitowa poświata pod nagłówkiem rozdziału 01, gdy wjeżdża nad jasną
  ścianą.
- `src/scripts/rendering/renderer.js`, `app.js`: pomiar czasu GPU (tylko w trybie `debug`).
- `tests/screens.py`: jedna plansza dla wszystkich profili i GPU, plansza przed/po, transfer
  surowy i brotli, czasy klatek w czasie nagrań. `tests/browser_smoke.py`: test wolnego GPU.

## Znane ograniczenia

- **Smugi na ściankach odprysków** (lewa górna część bryłki w nowej pozie): cienkie jasne linie
  promieniste, widoczne w Three.js, niewidoczne w posterze z Cycles. Sprawdzone po stronie
  runtime: anizotropia 8 (już włączona), `computeTangents()`, wyłączenie mipmap, nic nie pomogło.
  Źródłem jest mapa metallicRoughness: margines bake'u typu EXTEND (16 px) wokół wysp UV węższych
  niż teksel. Naprawa tylko w assecie (`margin_type="ADJACENT_FACES"`, większy `island_margin`,
  21 min buildu bryłki). Szczegóły: `docs/qa/assets/NOTES.md`.
- **Ziarno w zbliżeniu** układa się w wyraźne komórki („plaster miodu”) w górnej części ściany
  przy postępie 0,5–0,75. Obniżenie ekspozycji przesunęło je z bieli do szarości, ale wzór zostaje;
  to tekstura łatki `fracture-face.glb`.
- ~~**Cięcie przy postępie 1,0** do bryłki v0.1 rozdziału 01.~~ Zamknięte 1 października 2026:
  ściana przenika w sieć krzemu bez cięcia (`docs/ART_DIRECTION.md`, „01 materia”; dowody
  `docs/qa/after/lattice-board.webp`, `lattice-scroll-desktop.webm`).
- **Mobile przy postępie 0,5**: w połowie łuku bryłka jest częściowo poza lewą krawędzią kadru.
  Klatka przejściowa, w ruchu czytelna, ale nie jest to kadr do zatrzymania.
- **Oświetlenie w dojeździe** obraca studio między postępem ok. 0,40 a 0,57 o 60° plus kąt, który
  zdążył obrócić ambient. Kamera jest wtedy w szybkim łuku, więc zmiana jest częściowo maskowana;
  nie oceniałem tego osobno klatka po klatce.
- Pomiary klatek są przycięte do 60 Hz; zapas pokazuje tylko czas GPU z timer query, który mierzy
  czas wykonania poleceń WebGL, nie kompozycję strony.
- Headless Chromium na Linuksie z ANGLE/EGL to nie jest przeglądarka użytkownika: brak prawdziwego
  kompozytora okna, brak VRR, brak throttlingu termicznego w 60 s testach.

## NIEZWERYFIKOWANE

Poniższe nie zostało sprawdzone. Brak wyników nie oznacza, że działa.

- Fizyczny iPhone w Safari (WebKit, WebGL 2 na Metal, pasek adresu, safe areas).
- Słabszy Android w Chrome (Mali/Adreno średniej klasy, termika po kilku minutach).
- Laptop z Windows i zintegrowanym GPU (Intel Iris Xe albo AMD przez D3D11/ANGLE).
- Firefox (silnik Gecko; Playwright Firefox i WebKit nie są zainstalowane na tej maszynie).
- Prawdziwa sieć (3G/4G, dławienie, zimny cache CDN); wszystkie liczby są z localhosta.
- Ciągłe użytkowanie przez kilka minut (najdłuższy przebieg to 44 s nagrania).
- Zoom 200 % i zmiana orientacji na fizycznym urządzeniu (emulacja: tylko viewporty).
- Czytniki ekranu (VoiceOver, TalkBack, NVDA).

## Checklista dla właściciela

Na każdym urządzeniu otwórz stronę z pustym cache i przejdź te kroki. Zapisz model, system,
przeglądarkę i wynik.

1. Pierwszy widok: poster bryłki widoczny od razu, nagłówek „Krzem.” czytelny, nic nie skacze.
2. Po 1–3 s: przejście z posteru do 3D bez błysku, zmiany jasności i przesunięcia bryłki.
3. Poczekaj 20 s: bryłka powoli się obraca, telefon nie grzeje się wyraźnie.
4. Przewiń powoli w dół: tekst hero znika, kamera zatacza łuk i wchodzi w szarą ścianę z rysą,
   obraz gaśnie do grafitu, pojawia się „Od natury. Do precyzji.”. Nagłówek czytelny cały czas.
5. Przewiń szybko w górę i w dół kilka razy, raz zmień kierunek w połowie przejścia: obraz
   nadąża za palcem, nie ma czarnego ekranu ani zatrzymania.
6. Przełącz na inną aplikację na 30 s i wróć: stan ten sam, animacja rusza dalej.
7. Kliknij „Ogranicz animacje”: strona przechodzi w tryb spokojny z posterami, w tym samym
   miejscu opowieści. Kliknij ponownie: 3D wraca.
8. Obróć telefon do poziomu i z powrotem: układ się dopasowuje, bez poziomego przewijania.
9. Włącz w systemie ograniczenie ruchu i odśwież: od razu tryb spokojny, bez 3D.
10. Na komputerze z Windows i grafiką zintegrowaną: to samo, plus Chrome DevTools → Performance,
    nagraj przejście hero → materia i zanotuj, czy są klatki dłuższe niż 50 ms.

Jeśli którykolwiek krok zawiedzie, zapisz zrzut ekranu i adres z parametrem `?debug`, wtedy
w konsoli `krzemDebug.profile`, `krzemDebug.window` i `krzemDebug.gpu` pokażą profil i pomiary.
