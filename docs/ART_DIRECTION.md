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

- **Obraz:** jeden tranzystor FinFET jako jeden obiekt na płycie podłoża: trzy żebra biegną z
  lewej na prawo, po obu stronach wypukłe obszary źródła i drenu (symetryczne), w środku jedna
  bramka okrakiem na żebrach, nad nimi kontakty. Sąsiednie bramki i poziomy metalu są pominięte,
  żeby nic nie zasłaniało głównej myśli. Żebra w skali procesu 14 nm (`docs/SCIENCE.md`).
- **Cięcie:** pionowa płaszczyzna pod 45° przez bramkę, przechodząca przez przednie żebro w środku
  bramki: przekrój patrzy w kamerę i pokazuje bramkę (złoty TiN, jasny dielektryk, szare
  wypełnienie) obejmującą żebro z trzech stron. Przednie połowy źródła i drenu przedniego żebra
  są ścięte, więc żebro widać na całej długości. Przekroje są matowe, z cienkimi liniami na
  granicach warstw.
- **Powierzchnie:** drobne kierunkowe ziarno na materiał (wzdłuż osi, wzdłuż której powierzchnia
  rosła lub była polerowana), lekkie wytarcie krawędzi, zaokrąglenia w normalnych, analityczne
  cienie kontaktowe. Płyta podłoża biegnie w tył i gaśnie w tle (horyzont, nie winieta).
- **Światło i optyka:** HDR studia (obrócony do osi Z sceny), chłodne światło z góry, jedno niskie
  ciepłe z boku drenu. Głębia ostrości w jednym przebiegu, ostra płaszczyzna na przednim żebrze
  przy bramce (tej samej, dla której prawdziwa jest podziałka). Liczba próbek i MSAA idą za
  profilem, także po automatycznym obniżeniu.
- **Stany:** OFF: brak kanału, nośniki (jasne kulki) stłoczone w źródle tuż przed bramką. ON:
  bursztynowy kanał w żebrze pod bramką, słaba poświata, nośniki płyną ze źródła przez kanał do
  drenu; tam, gdzie zasłania je materiał, widać ich słabe odbicie. Różnicę niosą kształt i ruch
  oraz tekst statusu, nie sam kolor. Przełączenie trwa ok. 0,4 s.
- **Kamera:** z przodu i z góry, wolny obrót i lekki odjazd do końca rozdziału (miejsce na odjazd
  do wielu tranzystorów w rozdziale 03). Mobile: dalej, obiekt pod tekstem i przełącznikiem.
- **Podpisy części:** prawdziwy tekst HTML z cienkimi liniami, pozycje z tej samej kamery co scena;
  na desktopie sześć (Źródło, Bramka, Dren, Żebro (kanał), Izolator, Kontakt), na telefonie
  cztery najważniejsze. Bez JS i w trybie spokojnym te same pozycje leżą na posterach OFF/ON.
- **Przejścia:** 01 → 02 i 02 → 03 przez tło.

## 03 skala: połączenia (`scenes/scale.js`, `scenes/scale-math.js`)

Jeden ciągły przelot sterowany scrollem (pięć klatek kontrolnych, interpolacja monotoniczna, odległość
w skali logarytmicznej):
- **0, wejście:** ta sama kamera co koniec rozdziału 02; FinFET przenika w jeden z rzędów tranzystorów.
- **0,16, powtórzenie:** rzędy żeber i bramek do horyzontu.
- **0,3, wewnątrz warstw:** nad frontem osadzania, w dół na krzyżujące się poziomy: chłodne, stalowe
  niskie poziomy w głębi, miedziane środkowe w niskim słońcu. Poziomy narastają w kolejności produkcji.
- **0,6, odsłona:** tuż nad najwyższymi pasami zasilania, ok. 15° w dół, wzdłuż nich: pasy uciekają
  do horyzontu w górnej trzeciej kadru, mgła przy horyzoncie jaśniejsza i cieplejsza (niskie słońce),
  wyżej tło strony. Najbliższy pas nisko po lewej, pod nagłówkiem. Niskie słońce z prawej, silniejsze
  tylko w okolicy odsłony. Dopiero tu pojawia się nagłówek „To nie jest miasto.”.
- **0,8, róg chipu:** pierścień padów, pierścienie uszczelniające, bloki; **1, wyjście:** chip jako
  obiekt: bloki pamięci z delikatnym połyskiem zależnym od kąta, logika jako rzędy komórek wypełnione
  prawdziwym routingiem w zmniejszeniu, bloki analogowe/IO przy krawędzi, siatka zasilania co 100 µm
  łapiąca słońce, jaśniejszy bok krzemu; gotowy na rozdział 04 (przenikanie przez tło).

Trzy reprezentacje (prawdziwe pudełka, płaskie przedłużenia z filtrowanym wzorem, powierzchnia chipu)
przechodzą jedna w drugą komplementarnym ditherem; linie poniżej piksela uśredniają się zamiast
migotać. Jedno niskie ciepłe słońce (cienie na cinematic), chłodne światło w cieniu, głębia w
granat-czerń, mgła do koloru tła. Na telefonie kadr niżej i miękka grafitowa poświata pod tekstem.

Robot, świecący mózg, fioletowy gradient AI, HUD, burze cząsteczek, plastikowe klocki, jednolity
chrom. Krzem nie jest kwarcem, diamentem ani folią. Bloomu i postprocessu nie ma także w sieci.
Rozdziały 04–06 wciąż korzystają ze scen v0.1 i czekają na etap C.
