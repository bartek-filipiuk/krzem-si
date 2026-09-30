# QA — 30 września 2026

Wykonano 11 testów Node (`npm run verify`) i 72 asercje w Chromium przez Playwright. Wszystkie przeszły. Screeny pochodzą z rzeczywistego renderu HTML/CSS/WebGL.

Przeglądarka renderowała samowystarczalny podgląd z identycznym kodem źródłowym, osadzonym jako moduły data URL. Konfiguracja uruchomienia w tym środowisku: Chromium, `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist`. Przetestowano również oddzielnie serwer HTTP Node i build normalnych plików.

Viewporty: desktop 1440×1000, mobile 390×844, mały telefon 320×640, tablet 1024×768. Sprawdzono inicjalizację WebGL, zmianę rozdziałów, brak błędów GPU, przełącznik tranzystora, demonstrację AI, przełączanie animacji, zachowanie aktywnego rozdziału, nawigację, utratę kontekstu oraz wersje bez GPU/JS i z reduced motion.

Nie wykonano pomiarów na fizycznych telefonach, testów Safari/Firefox, uruchomienia Dockera ani pipeline'ów GitHub Actions. To nie jest benchmark 60 fps ani pełny audyt WCAG.

Wynik builda: 369,8 KiB wszystkich plików produkcyjnych przed dodaniem wariantów .br/.gz, około 21,0 KiB gzip dla sumy HTML/CSS/JS. Nie jest to wielkość początkowego transferu: pozostałe sceny są ładowane w miarę potrzeby.
