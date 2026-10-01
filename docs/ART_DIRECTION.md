# Kierunek wizualny

Muzealne studio, nie efekty. Głęboki grafit `#0b0e12`, złamana biel tekstu, chłodne srebrne
refleksy, jeden bursztynowy rim. Obraz ma się bronić na zatrzymanej klatce: kształt, materiał
i światło, bez bloomu i grainu (nakładkę `film-grain` z v0.1 usunięto). Mgła tylko jako głębia sieci krystalicznej w rozdziale 01, do koloru tła.

Źródło prawdy o świetle i kadrze to pipeline Blendera (`tools/blender/`, etap A2):
`hero-camera.json` (kamera desktop/mobile, obrót bryłki, ekspozycja, tone mapping, ściana wejścia)
i `studio-1k.hdr` (cztery softboxy studia wypalone w HDR). Runtime niczego tu nie zgaduje, tylko
czyta te pliki; poster i pierwsza klatka WebGL pochodzą z tej samej kamery.

## 00 hero

- **Poza:** bryłka obrócona o 120° (`chunkRotationY`): do kamery szeroka szara ściana przełamu
  z długą rysą, czytelny obrys. Poza 180° z A2 pokazywała wydłużony koniec i cienkie ścianki
  odprysków z włoskowatymi smugami (`docs/qa/assets/NOTES.md`).
- **Desktop:** bryłka po prawej od środka (ok. 65% szerokości), wolna od karty „14 / Si”, duży
  szeryfowy nagłówek po lewej. Kamera z JSON-u (`desktop`, FOV 42° w pionie, 2,5 m), lekko z góry.
- **Mobile:** osobny kadr (`mobile`, FOV 50°, 3,7 m): bryłka nisko i lekko w lewo (ok. 55–90%
  wysokości), pod H1, tekstem i linkiem „Odkryj”; karta „Si” obok niej po prawej.
- **Krótki ekran** (`data-compact`): ten sam kadr kamery co poster, ciaśniejsza typografia.
  Wysokość ekranu wybiera układ, nigdy profil jakości.
- **Ruch:** jeden obrót na 90 s na zegarze ambientu, startuje od pozy posteru i rozpędza się przez
  2 s po przejęciu obrazu. Paralaksa kursora do 2° z wygaszaniem (stała 400 ms), tylko mysz.
- **Przejęcie posteru:** poster jest pierwszą klatką. Canvas rysuje tę samą klatkę pod nim, potem
  poster znika w 300 ms. Poświata tła z posteru (radialna, `#5a7896`, alfa 0,16) jest odtworzona
  w CSS za przezroczystym canvasem, więc tło się nie zmienia.

## Wejście w materię (hero → 01)

Postęp hero liczymy od góry hero (0) do przypięcia rozdziału materii (1). Fazy (`story/timeline.js`):

| Postęp hero | Co się dzieje |
|---|---|
| 0–0,20 | kadr hero, obrót i paralaksa |
| 0,20–0,35 | tekst hero wygasa, poświata hero przechodzi w ambient rozdziałów |
| 0,20–0,70 | kamera jedzie do ściany wejścia; obrót bryłki zwalnia do zera |
| 0,70–0,87 | ściana przełamu wypełnia kadr, kamera dalej się zbliża (60% pozostałej drogi) |
| 0,72–0,87 | ściana gaśnie do tła strony (przyciemnienie w WebGL, nie fade całego canvasu) |
| 0,79–0,98 | przed gasnącą ścianą z mgły wyłania się sieć krzemu, kamera sieci już płynie naprzód |
| 0,87 | ściana jest całkiem ciemna i przestaje być rysowana; od tej chwili tylko sieć |
| 1,0 | rozdział 01 przypięty, sieć w pełni widoczna (bez cięcia) |

- **Kadr wejścia:** kadr hero przy postępie 0,2, identyczny z posterem, jeśli czytelnik nie
  poruszał myszą.
- **Ruch:** kamera jest liczona w układzie bryłki (orbita + dolly, `story/camera-rig.js`):
  kierunek widzenia przechodzi od kierunku kamery hero do kierunku ściany, środek orbity przesuwa
  się ze środka bryłki na środek ściany, odległość maleje z 2,5 m (desktop) albo 3,7 m (mobile) do 0,26 m głównie w
  drugiej połowie ruchu. Przy pozie 120° ściana wejścia leży na lewym boku bryłki, więc kamera
  zatacza łuk ok. 55° w lewo. Gdy ściana jest akurat odwrócona od widza, kamera przechodzi górą nad bryłką
  (nie przez nią). Pozycja kamery zależy tylko od postępu i kąta bryłki, więc cofanie scrolla
  odtwarza te same klatki.
- **Obiekt prowadzący:** ściana przełamu wskazana przez A2 (`entryFace`), rysa jako linia
  prowadząca. Kamera kończy na normalnej ściany. W ostatniej fazie studio obraca się do układu
  światła, w którym A2 wybrało tę ścianę (`entryFace.lightRotationY` = 180°), więc zbliżenie nie
  zależy od pozy hero ani od tego, dokąd doszedł obrót. Ściana patrzy wtedy prawie wprost na
  kluczowy softbox, dlatego ekspozycja łagodnie spada wzdłuż dojazdu (×1 przy s = 0, czyli
  dokładnie poster; ×0,49 przy pełnym kadrze ściany): powierzchnia zostaje w zakresie szarości
  i grafitu zamiast przepalać się do bieli.
  Od chwili, gdy czytelnik zaczyna scrollować, dociąga się łatka `fracture-face.glb` o gęstszych
  UV (ta sama przestrzeń obiektu, przesunięcie głębi zamiast z-fightingu).
- **Kadr wyjścia:** ziarna polikrystalicznej ściany i prążki przełamu na całym ekranie; ściana
  gaśnie, a w ciemności przed nią pojawia się pierwsze ziarno sieci krystalicznej (duże, bliskie
  atomy, dużo pustej przestrzeni). Nagłówek „Od natury. Do precyzji.” wjeżdża od dołu razem ze
  sceną 01; nad jasną ścianą ma miękką grafitową poświatę (`text-shadow`, tylko gdy aktywny jest hero).

Przejście jest przenikaniem w jednym kadrze WebGL: ściana bryłki (centymetry) gaśnie, sieć
(nanometry) wyłania się z mgły. Podziałka pojawia się dopiero, gdy sieć dominuje, i pokazuje
wyłącznie skalę sieci; skoku rzędów wielkości nie udajemy liczbami.

## 01 materia: sieć krzemu (`scenes/lattice.js`, `scenes/lattice-math.js`)

- **Obraz:** prawdziwa struktura diamentu krzemu (a = 0,5431 nm), model kulkowo-pręcikowy: małe
  srebrnoszare atomy (0,022 nm, impostory kul, oświetlone tym samym HDR studia co bryłka), bardzo
  cienkie pręty, głębia przez mgłę do `#0b0e12` (sieć kończy się ok. 4,4 nm przed kamerą, w
  balanced 3,8 nm). Wokół kamery jest „polana” ok. 1 nm: najbliższe atomy znikają.
- **Głębia ostrości:** jedna ostra płaszczyzna 2 nm przed kamerą (ta sama, dla której prawdziwa
  jest podziałka). Atomy poza nią są miękkimi krążkami, których światło rozkłada się na rozmycie
  (rysowane od dalszych do bliższych), pręty poza nią cienieją i znikają. Dzięki temu środek
  rozdziału to spokojna, głęboka struktura, a nie gąszcz. Przy wyłanianiu się sieci ostrość
  przechodzi z najbliższego ziarna (1,1 nm) na 2 nm, zanim pojawi się podziałka.
- **Ruch:** postęp rozdziału przesuwa prawie poziomą płaszczyznę frontu krystalizacji od dołu
  kadru do góry; jej gorąca krawędź przecina całą szerokość kadru (w ostrej płaszczyźnie: dolna
  część przy postępie 0,25, górna przy 0,5, test w `tests/core.test.mjs`). Przed frontem ziarna (ta sama sieć obrócona wokół środka ziarna, seed 14, granice jako
  szczeliny) są przygaszone; za frontem atomy wracają do jednej orientacji i jaśnieją. Wąskie pasmo
  przy froncie świeci bursztynem i lekko drga: jedyny ciepły akcent rozdziału. Kamera płynie wzdłuż
  kanału [110] i hamuje do zera, a jednocześnie obraca się z ukosa na oś kanału.
- **Kadr końcowy („wow”):** widok wzdłuż [110]: sześciokątne kanały zbiegają się w ciemnym punkcie
  zbiegu. Przesunięcie obiektywu (lens shift) stawia punkt zbiegu obok tekstu: desktop ok. 63%
  szerokości, mobile ok. 64% wysokości od góry. Strona z nagłówkiem i pas pod podpisami są
  przyciemnione w shaderze (welon do koloru tła), więc tekst zostaje czytelny i ten sam welon jest
  w posterze.
- **Ambient:** powolny dryf kamery (setne części nm, okres ok. 70 s) na zegarze ambientu.
- **Wyjście do 02:** sieć cofa się w mgłę, a scena v0.1 rozdziału 02 przenika nad nią. Odjazd
  kamery do lustrzanej powierzchni płytki („Płytka” w pasku etapów) nie jest zrobiony: wersja,
  która byłaby prawdziwa w skali i przekonująca, wymaga osobnej sceny powierzchni (patrz raport).
- **Pasek etapów** nad siecią ma grafitową poświatę pod tekstem i mocniejszy welon dołu kadru.
- **Poster (calm, bez JS, błędy):** zrzut działającej sceny w kadrze końcowym, bez tekstu strony
  (`python tests/screens.py posters`).
- **Podziałka:** element DOM pod tekstem, liczony co klatkę z kamery (piksele na nm w płaszczyźnie
  2 nm przed kamerą), widoczny tylko przy żywej kamerze. Podpis mówi wprost, co jest umowne.

## Profile

- **cinematic:** tekstury 2K (1K przy kadrze mobile), MSAA, anizotropia 8, DPR do 1,5.
- **balanced:** tekstury 1K, bez MSAA i anizotropii, DPR do 1,0 z budżetem pikseli. Ten sam ruch.
- **calm:** postery, pełna treść i interakcje DOM, brak przelotów, brak ambientu, brak importu
  Three.js. Układ płynący zamiast przypiętych scen.

## Czego nie robimy

## 02 przełącznik: FinFET (`scenes/transistor.js`, `scenes/transistor-math.js`)

- **Obraz:** wycinek tranzystora FinFET wygenerowany w kodzie, w skali głównych wymiarów procesu
  14 nm (żebra, bramki, ścieżki; `docs/SCIENCE.md`). Schodkowe cięcie: z przodu po stronie źródła
  usunięta ćwiartka (płaszczyzna przez środek przedniego żebra i przez środek bramki), nad stroną
  źródła zdjęty metal. Na przekroju widać, jak bramka (TiN złoty, wypełnienie szare, cienki jasny
  dielektryk) obejmuje żebro z trzech stron; to główna myśl kadru. Przekroje są matowe i nieco
  ciemniejsze od powierzchni, krawędzie zaokrąglone w normalnych, kontaktowe cienie analityczne.
- **Światło i optyka:** HDR studia (obrócony do osi Z sceny), chłodne światło kluczowe z góry,
  jedno niskie ciepłe z boku drenu. Głębia ostrości w jednym przebiegu pełnoekranowym, ostra
  płaszczyzna na rogu cięcia (tej samej, dla której prawdziwa jest podziałka). Próbka wygasa do
  tła na dalszych krawędziach i w dół, więc nie czyta się jako kostka.
- **Stany:** OFF: brak kanału, punkty (nośniki) stoją po stronie źródła przed bramką. ON: cienka
  bursztynowa warstwa kanału pod bramką, słaba poświata na bramce, punkty płyną od źródła przez
  kanał. Różnicę niesie też kształt (obecność kanału, ruch) i tekst statusu, nie sam kolor.
  Przełączenie trwa ok. 0,4 s (wygładzenie w `app.js`); pokaz z choreografią to następny krok.
- **Kamera:** z przodu i z góry na róg cięcia, wolny obrót (ok. 9°) i lekki odjazd do końca
  rozdziału (miejsce na odjazd do wielu tranzystorów w rozdziale 03). Mobile: dalej i niżej, pod
  tekstem i przełącznikiem.
- **Podpisy części:** prawdziwy tekst HTML (Źródło, Bramka, Dren, Żebro (kanał), Izolator,
  Kontakt) w dwóch kolumnach obok grupy punktów, z cienkimi liniami do punktów. Pozycje liczy ta
  sama czysta kamera co scena; bez JS i w trybie spokojnym te same pozycje leżą na posterach
  OFF/ON (pudełko przycięte jak `object-fit: cover`).
- **Przejścia:** 01 → 02 i 02 → 03 przez tło (sieć gaśnie w mgle, tranzystor wyłania się z
  grafitu; potem scena v0.1 rozdziału 03).

Robot, świecący mózg, fioletowy gradient AI, HUD, burze cząsteczek, plastikowe klocki, jednolity
chrom. Krzem nie jest kwarcem, diamentem ani folią. Bloomu i postprocessu nie ma także w sieci.
Rozdziały 03–06 wciąż korzystają ze scen v0.1 i czekają na etapy B i C.
