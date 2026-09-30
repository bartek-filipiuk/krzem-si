# krzem.si — od materii do możliwości

Pierwsza działająca wersja interaktywnej opowieści o krzemie: siedem rozdziałów, natywny scroll, proceduralne 3D, demonstracja tranzystora i matematyki AI. Bez frameworka frontendowego, paczek npm, API, CMS i zewnętrznych fontów.

**Status: funkcjonalny prototyp v0.1, nie finalny film fotorealistyczny.** Geometria jest generowana kodem. To autorska ilustracja, nie dokumentacja fizycznej budowy konkretnego procesora. Projekt nie jest jeszcze opublikowany na domenie.

## Uruchomienie

Wymagany Node.js 22 lub nowszy. Nie trzeba wykonywać `npm install`.

```bash
npm run dev
# http://127.0.0.1:4173
```

Zmiany w plikach są widoczne po odświeżeniu przeglądarki; nie ma automatycznego hot reloadu.

```bash
npm run verify        # kontrola składni/linków, testy, build + budżet rozmiaru
npm run build         # gotowy katalog dist/
npm run preview       # lokalny podgląd dist/ na porcie 4173
npm run standalone    # pojedynczy preview.html z osadzonym kodem i grafiką
```

Zatrzymaj `dev` przed uruchomieniem `preview`, ponieważ oba używają domyślnie portu 4173. Inny port: `npm run preview -- --port=4174`.

`preview.html` służy do przekazania podglądu, a **nie** jako zalecany format produkcyjnego wdrożenia. Produkcja korzysta z osobnych modułów i assetów w `dist/`.

## Co działa

Siedem scen: bryłka → przygotowanie materiału / płytka → tranzystor → struktury układu → komputer / telefon → obliczenia AI → powrót do fundamentu. Scroll steruje etapem, skalą, obrotem i przejściami; czas steruje dyskretnym oświetleniem. Mysz dodaje niewielką zmianę perspektywy. Nie przechwytujemy kółka myszy i nie podmieniamy natywnego przewijania.

Przełącznik tranzystora ma dwa stany i opis dla czytnika ekranu. Demonstracja AI odsłania wcześniej napisane reprezentacje liczbowe; niczego nie wysyła do modelu. Linki do rozdziałów, źródła, przycisk ograniczania ruchu oraz widoki mobilne są gotowe.

**To nie jest jeszcze całość wcześniejszej reżyserskiej wizji.** Brakuje prerenderowanych ujęć produkcji materiału, fotorealistycznej geometrii/tekstur, dopracowanego przelotu przez mikrostrukturę, pełnej wizualnej pętli ekranu w ekranie i opcjonalnego sound designu. Obecny finał zmienia komputer w bryłkę; nie odtwarza samej strony na modelu monitora. Dalszy kierunek opisuje `docs/ART_DIRECTION.md`.

## Wydajność i dostępność

Zwykły HTML jest podstawą. Bez JavaScriptu dostępna jest kompletna, nieprzypięta opowieść z lekkimi ilustracjami. Moduł GPU jest importowany dopiero po pierwszym wyświetleniu treści i tylko wtedy, gdy preferencje oraz zasoby na to pozwalają.

`prefers-reduced-motion`, oszczędzanie danych, bardzo mała ilość pamięci/rdzeni lub krótki ekran wybierają wersję spokojną. Na bardzo krótkim ekranie sterowanie animacją jest ukryte, aby zachować czytelny układ. W innych trybach można wyłączyć ruch ręcznie; zapisywana jest wyłącznie ta lokalna preferencja, jeśli przeglądarka pozwala na zapis.

Renderer używa jednego kontekstu WebGL 1, jednego programu shaderowego i scalonych buforów. Rozdzielczość jest ograniczona budżetem pikseli; tryb oszczędny dodatkowo ogranicza renderowanie do około 30 klatek/s. Monitor czasu klatek obniża jakość lub wraca do statycznej opowieści. Pętla zatrzymuje się w ukrytej karcie. Utrata kontekstu lub niedostępny WebGL nie blokują treści.

To mechanizmy ochronne, **nie gwarancja 60 fps na każdym urządzeniu**. Testy w emulowanych viewportach nie zastępują iPhone'a, słabego Androida ani pomiarów rzeczywistej sieci.

Materiały techniczne: [MDN — WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices), [MDN — prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion).

## Deploy

Wdróż **zawartość `dist/`**, nie cały projekt, na dowolnym hostingu statycznym. Build: `npm run build`; output: `dist`. Nie ma backendu ani wymaganych sekretów. Pliki `.br` i `.gz` są opcjonalnymi gotowymi wariantami kompresji; host może też serwować zwykłe pliki.

Canonical, Open Graph i sitemap mają domyślnie adres `https://krzem.si/`. Inny adres:

```bash
SITE_URL=https://example.com/ npm run build
```

### Docker / Hetzner / reverse proxy

```bash
docker compose up --build -d
# http://127.0.0.1:8080
```

Kontener jest związany z localhost hosta. W istniejącym reverse proxy skieruj domenę na port 8080. Caddy wewnątrz kontenera serwuje HTTP; TLS i DNS należą do konfiguracji zewnętrznego reverse proxy. Jest też przykład `deploy/Caddyfile.host` do serwowania plików bez kontenera.

**Dockerfile i konfiguracje są przygotowane, ale nie były uruchomione w Dockerze podczas przygotowywania tej paczki.** Lokalnie zweryfikowano build i serwer Node. Wersje obrazów Docker są tagami głównymi; przed twardym wdrożeniem można przypiąć sprawdzone digesty.

### GitHub Pages

Repo zawiera ręczny workflow `.github/workflows/pages.yml`. W Settings → Pages wybierz źródło GitHub Actions i uruchom workflow dopiero po ustawieniu tej usługi. Dla domeny krzem.si skonfiguruj ją oraz DNS w ustawieniach repo. Bez domeny ustaw zmienną repo `SITE_URL` na adres strony GitHub Pages. Ścieżki do zasobów są względne, więc działają też w podkatalogu repo.

Wrzucenie kodu samo **nie** uruchamia publikacji Pages. CI wykonuje tylko kontrolę i testy. Instrukcja: [GitHub Pages — custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Pliki

- `src/index.html`, `src/styles.css`: treść, dostępność, układ i design.
- `src/scripts/app.js`: scroll, interakcje, preferencje, cykl życia.
- `src/scripts/renderer.js`, `geometry.js`, `math.js`, `quality.js`: GPU, geometria, matematyka i limity.
- `src/assets/`: lokalne ilustracje zapasowe, favicon i karta społecznościowa.
- `tests/`: testy Node oraz opcjonalny test przeglądarkowy z robieniem screenshotów.
- `scripts/art/`: opcjonalne odtwarzanie scen przez Mesa EGL do wygenerowania ilustracji zapasowych; nie jest potrzebne do builda strony.

## Testy przeglądarkowe i screeny

Opcjonalnie zainstaluj Python Playwright i jego Chromium w oddzielnym środowisku. Następnie uruchom serwer `npm run dev`, a w drugim terminalu:

```bash
python tests/browser_smoke.py
```

Wyniki trafiają do `test-results/`. Zmienna `KRZEM_TEST_HTML` pozwala testować pojedynczy plik standalone; `KRZEM_BROWSER_EXECUTABLE` oraz `KRZEM_BROWSER_ARGS` wybierają przeglądarkę. Dołączony raport opisuje dokładnie wykonany wariant, zamiast sugerować testy na fizycznych urządzeniach.

## Materiały i licencja

Geometria i ilustracje zapasowe powstają z kodu projektu. Nie dołączamy cudzych modeli ani plików fontów. Fonty dobiera system użytkownika, więc na macOS i Windowsie mogą wyglądać odrobinę inaczej niż na screenach. Źródła merytoryczne są w stopce strony oraz `docs/SCIENCE.md`.

Nie wybrano jeszcze licencji open source. `private: true` w package.json zabezpiecza przed przypadkowym opublikowaniem paczki npm; nie wymaga prywatnego repozytorium GitHub.
