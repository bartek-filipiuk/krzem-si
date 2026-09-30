# Audyt v0.1 względem briefu (etap A1)

Stan bazowy: commit `57ee2b2`, gałąź `premium`. Screeny i nagranie: `docs/qa/before/`.
Wszystkie uwagi poniżej wynikają z tych screenów, nagrania albo z odczytu kodu w `src/`.

## Warunki pomiaru

- Node v22.20.0 (nvm). `npm run dev -- --port=4174`: port 4173 zajmuje `vite preview` innego projektu
  (`~/games-projects/tower-game-gpt6astra`), którego nie zatrzymywano.
- Python Playwright 1.58.0, Chromium 145.0.7632.6 headless (build Playwright), flagi
  `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist`, zmienna
  `__EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/10_nvidia.json`.
- WebGL faktycznie renderował: `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3070 Laptop GPU/PCIe/SSE2, OpenGL ES 3.2)`,
  sterownik 580.178.04. Na każdym ujęciu `data-renderer=webgl`, `data-quality=high`,
  `data-chapter` zgodny z rozdziałem (`before/capture-log.json`).
- Laptop jest hybrydowy. Bez zmiennej EGL Chromium (headless i Chrome 141 z oknem) wybiera iGPU
  `AMD RENOIR`. Headless bez flag daje SwiftShader. Chrome z oknem i zmiennymi NVIDIA też spadał do SwiftShadera.
- Viewporty: desktop 1440×1000 przy DPR 1, mobile 390×844 przy DPR 2 (`is_mobile`, `has_touch`, canvas 585×1266 po limicie pikseli).
- Pozycja: progress 0,5 rozdziału, ta sama technika `scrollTo` co w `tests/browser_smoke.py`, 700 ms na ustabilizowanie.
  Zegar ambientu nie jest zamrożony (v0.1 nie ma trybu QA), więc obrót bryłki zależy od czasu uruchomienia.
- Nagranie `desktop-scroll.webm`: 36 s, 1440×1000, liniowy scroll przez całą stronę w 30 s,
  screencast Playwright w 25 kl./s, przekodowany do VP9 (CRF 42). To zapis obrazu, nie pomiar płynności.
- Screeny: PNG z Playwright zamienione na WebP q85 (ffmpeg). Skrypt: `before/capture.py`.
- Kontrola: `npm test` daje 11/11, `tests/browser_smoke.py` na tym samym GPU daje 72/72 asercje.

## Braki per rozdział

**00 hero (`poczatek`)**
- Bryłka to ikosfera po 4 podziałach z płaskimi normalnymi. Siatka trójkątów jest widoczna na zatrzymanej klatce, a szum normalnych daje efekt brokatu lub folii, nie przełamu.
- Bursztynowy refleks zalewa całą ścianę i wygląda jak zabrudzenie (piryt), nie jak odbicie studia. Brak HDR, PBR i map roughness.
- Poster znika natychmiast (`visibility:hidden`) bez przejęcia klatki. Przejście do materii to `scale()` bryłki i przenikanie; kamera ma stałe `eye=[0,0,7.8]`. Na mobile bryłka nachodzi na kartę „14 Si”.

**01 materia**
- Cztery etapy (Kwarc, Oczyszczanie, Monokryształ, Płytka) zamiast pięciu z briefu. Brak osobnej redukcji i krystalizacji jako obrazu.
- Wlewek to walec z 64 ścianami z widocznymi pasami fasetowania i płaskim czarnym denkiem. Płytka ma w shaderze siatkę i tęczową nakładkę, więc na etapie „wypolerowana powierzchnia” wygląda już jak wzorzysty wafer.

**02 tranzystor**
- To dokładnie „plastikowe klocki” z briefu: brązowe i szare prostopadłościany na płycie, bez warstwy tlenku ani rozróżnialnych materiałów.
- Stan zmienia głównie kolor kanału (ciemny/bursztynowy). Brak oznaczenia „umowna wizualizacja przepływu”. Podpisy ŹRÓDŁO/BRAMKA/DREN to stały wiersz DOM, który na desktopie nie leży pod odpowiednimi elementami modelu.
- Przycisk przełącza stan, zamiast powtarzać demonstrację. Po jednym kliknięciu scroll już nigdy jej nie odtwarza, bo `manualPower` nie jest resetowany.

**03 skala**
- Płaska plansza obracana i skalowana (`lerp(1.55,.8)`), bez przelotu kamery i bez pięciu kadrów. Bloki z paskami czytają się jak dachy miasta, czego brief zakazuje.
- Nagłówek „To nie jest miasto” jest widoczny od wejścia, nie po zmianie perspektywy. Struktura wchodzi pod tekst stopki, znacznik „MAŁA SKALA / WIELKA ZMIANA” i kropki nawigacji; te napisy są na niej nieczytelne (desktop i mobile).

**04 świat**
- Przy progress 0,5 komputer i telefon przenikają się z przezroczystością 50%, co daje podwójny, „duchowy” obraz.
- Na ekranach są te same ogólne kreski. Brakuje chipu jako punktu odniesienia i kontekstów z briefu (terminal, obraz, komunikacja).

**05 inteligencja**
- Przycisk przełącza dwa widoki: obliczenia albo odpowiedź. Nie ma sekwencji polecenie → liczby → operacje → sprzęt → odpowiedź ani kroku „sprzęt”.
- Grafika (siatka ścieżek i unosząca się macierz nad chipem) nie jest powiązana z krokami demonstracji. Panel DOM leży na siatce 3D.

**06 fundament**
- Komputer wygasa i pojawia się bryłka. Brak pętli chip → urządzenie → ekran z hero krzem.si → bryłka.
- „Si → SI” to statyczny napis DOM, a nie domknięcie ujęcia.

## Braki przekrojowe

- Renderer: WebGL 1, jeden shader, płaskie normalne, brak glTF, PBR i HDR. Przejścia między rozdziałami to przenikanie niepowiązanych obiektów w jednym kadrze (na nagraniu tranzystor nałożony na planszę skali, telefon na siatkę AI).
- Jakość: `initialQuality` obniża tier według `hardwareConcurrency` i `deviceMemory`, a `compactViewport()` według wysokości viewportu. Brief zabrania traktowania tych sygnałów jako miary GPU.
- Degradacja zmienia tylko rozdzielczość i limit 30 kl./s. Siatki są cache'owane po nazwie, a LOD planszy (`circuit(30|20)`) wybiera się raz, przy pierwszym uploadzie. `FrameBudget` liczy średnią, nie medianę ani p95.
- Brak trybu QA (`?scene=&progress=&quality=&freeze=`). Istnieje tylko `?debug`.
- Fonty: tylko systemowy stos bez pliku fontu. Na tej maszynie fontconfig podstawia DejaVu/P052/Liberation, więc typografia zależy od systemu.
- Numeracja się rozjeżdża: nawigacja ma 01–07, eyebrow hero „001”, eyebrow rozdziałów 01–06, stopki „01 — 06”.
- Nakładka `film-grain` (SVG turbulence, opacity 0,038) leży nad całą stroną. Jest subtelna, ale brief każe nie maskować obrazu grainem.

## Co v0.1 już spełnia i co trzeba zachować

- Semantyczny HTML: `h1`/`h2` w każdym rozdziale, skip link, `aria-label` nawigacji, `aria-current`, `aria-pressed`/`aria-expanded`, `aria-live` przy tranzystorze i widoczny focus (outline w kolorze amber).
- Bez JS jest cała opowieść z posterami (smoke: `no-javascript`, nagłówki wszystkich 7 rozdziałów widoczne). Polski tekst ze znakami diakrytycznymi to zwykły HTML.
- Natywny scroll: listenery `passive`, żadnego `preventDefault` na wheel/touch (jedyny jest przy `webglcontextlost`). Brak obowiązkowego „Start”.
- Przycisk „Ogranicz animacje” z zapisem preferencji. `prefers-reduced-motion` i Save-Data wybierają tryb statyczny przed importem GPU.
- Brak WebGL i utrata kontekstu kończą się czytelnym trybem statycznym z działającymi interakcjami (smoke: `no-webgl`, context loss).
- Moduł renderera jest ładowany leniwie (`import()` po `requestIdleCallback`). Ukryta karta zatrzymuje pętlę.
- Jedno płótno, jedna pętla rAF, seedowana losowość. Stan zależy od (rozdział, progress, ręczna interakcja), a ambient ma osobny zegar.
- Linki kotwic i nawigacja rozdziałów działają. Brak poziomego overflow przy 320, 390, 1024 i 1440 px.
- Uczciwe podpisy: „MODEL POGLĄDOWY MOSFET · NIE W SKALI”, „ARTYSTYCZNA WIZUALIZACJA STRUKTUR · NIE MIKROFOTOGRAFIA”, „DEMONSTRACJA · BEZ POŁĄCZENIA Z MODELEM”, stopka ze źródłami i rozwijana nota o uproszczeniach.
- Paleta (grafit `#090c10`, złamana biel, oszczędny bursztyn `#d0ad79`) i duże, spokojne nagłówki szeryfowe.
- Statyczny build ze względnymi ścieżkami (`npm run build` do `dist/`). Docker i Caddy są przygotowane, ale w v0.1 ich nie uruchamiano.

## Wpływ na plan

- Vite `preview` domyślnie też używa portu 4173, więc w A3 port powinien być konfigurowalny albo inny (np. 4174).
- Profil wydajności trzeba mierzyć dwa razy. Zwykły Chrome na tym laptopie renderuje na iGPU AMD Renoir, nie na RTX 3070. To daje od razu test „laptopa z integrą” (Linux, nie Windows). RTX wymaga headless ANGLE/EGL ze zmienną NVIDIA; nagrania z okna Chrome na RTX nie zadziałały.
- Blender 5.2.2 LTS widzi headless OptiX i CUDA na RTX 3070, więc postery A2 mogą iść przez Cycles na GPU.
- Podpisy tranzystora (B) muszą być przypięte do geometrii, a nie trzymane w stałym wierszu DOM.
- Materia (C) potrzebuje pięciu etapów, nie czterech. To zmiana treści, nie tylko obrazu.
