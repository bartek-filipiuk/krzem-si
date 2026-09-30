# Kierunek wizualny

Muzealne studio, nie efekty. Głęboki grafit `#0b0e12`, złamana biel tekstu, chłodne srebrne
refleksy, jeden bursztynowy rim. Obraz ma się bronić na zatrzymanej klatce: kształt, materiał
i światło, bez bloomu, mgły i grainu (nakładkę `film-grain` z v0.1 usunięto).

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
| 0,70–0,74 | ściana przełamu wypełnia kadr |
| 0,74–0,84 | obraz gaśnie do tła strony (nie do czerni) |
| 0,84 | cięcie: scena materii (na razie proceduralna scena v0.1 rozdziału 01) |
| 0,84–0,97 | scena materii się pojawia; od 1,0 rozdział 01 jest przypięty |

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
- **Kadr wyjścia:** ziarna polikrystalicznej ściany i prążki przełamu na całym ekranie, potem
  wygaszenie do grafitu i cięcie do pierwszej klatki rozdziału materii. Nagłówek „Od natury. Do
  precyzji.” wjeżdża od dołu razem ze sceną 01; nad jasną ścianą ma miękką grafitową poświatę
  (`text-shadow`, tylko gdy aktywny jest hero).
- **Znana luka (etap C):** przy postępie 1,0 cięcie trafia do proceduralnej, beżowej bryłki v0.1
  rozdziału 01. Materiałowo to inny obiekt niż krzem z hero; do wymiany razem ze sceną materii.

Przenikania dwóch obiektów nie ma: między bryłką a sceną materii jest świadome cięcie w tle
strony.

## Profile

- **cinematic:** tekstury 2K (1K przy kadrze mobile), MSAA, anizotropia 8, DPR do 1,5.
- **balanced:** tekstury 1K, bez MSAA i anizotropii, DPR do 1,0 z budżetem pikseli. Ten sam ruch.
- **calm:** postery, pełna treść i interakcje DOM, brak przelotów, brak ambientu, brak importu
  Three.js. Układ płynący zamiast przypiętych scen.

## Czego nie robimy

Robot, świecący mózg, fioletowy gradient AI, HUD, burze cząsteczek, plastikowe klocki, jednolity
chrom. Krzem nie jest kwarcem, diamentem ani folią. Rozdziały 02–06 wciąż korzystają ze
scen v0.1 i czekają na etapy B i C.
