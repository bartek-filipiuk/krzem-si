# krzem.si — brief wykonawczy: od prototypu do filmowego doświadczenia

**Dla agenta realizującego projekt.** Pracuj w istniejącym repozytorium. Ten dokument opisuje zadanie do wykonania, nie twierdzi, że te funkcje już działają. Punkt odniesienia: przekazana paczka `krzem-si-source.zip`, funkcjonalny prototyp v0.1. Jeśli repo jest nowsze, najpierw porównaj różnice i nie nadpisuj cudzej pracy.

## 1. Zlecenie

Doprowadź krzem.si do jakości dopracowanej, filmowej opowieści internetowej o krzemie jako materialnym fundamencie komputerów i współczesnej AI. Odpowiadasz za kierunek wizualny, produkcję assetów, kamerę, implementację oraz kontrolę jakości. Nie wystarczy dodać animacji do obecnych uproszczonych modeli.

Odbiorca ma poczuć: **„wszedłem w kawałek materii i zobaczyłem fundament cyfrowego świata”**. Zachwyt wynika z materiału, światła, skali i odkrywania zależności. Nie z liczby efektów.

Efektem ma być działająca strona z gotowymi zasobami, a nie sam plan, mockup, instrukcja „tu wstaw GLB” ani lista przyszłych ulepszeń. Nie wolno nazywać placeholderów fotorealistyczną realizacją. Gdy określonego narzędzia, modelu lub mocy obliczeniowej brakuje, opisz konkretny brak i dostarcz najlepszy rzeczywiście wykonany wariant wraz z procedurą uzupełnienia. Nie zgaduj wyników testów.

## 2. Co zastajesz — zweryfikuj przed zmianami

Najpierw przeczytaj `README.md`, `docs/ART_DIRECTION.md`, `docs/SCIENCE.md`, `src/index.html`, `src/styles.css`, `src/scripts/app.js`, `renderer.js`, `geometry.js`, `math.js`, `quality.js`, `package.json` oraz `tests/`. Uruchom projekt i zrób własne screeny oraz nagranie stanu początkowego. Archiwalne raporty nie zastępują nowych testów.

W przekazanym v0.1:

- Treść i obsługa strony są w zwykłym HTML/CSS/JS. Jest siedem rozdziałów, natywny scroll, nawigacja, tranzystor, demonstracja AI i statyczny fallback.
- `renderer.js` ma własny renderer WebGL 1, prosty shader, proceduralne odbicia i geometrię z `geometry.js`. Nie ma loadera glTF, pipeline'u tekstur PBR ani środowiska HDR.
- Kamera ma stałe `eye = [0,0,7.8]`. Zmiany scen wynikają przede wszystkim z transformacji modeli i przenikania. Scena skali nie jest jeszcze wyreżyserowanym przelotem kamery.
- Finał wygasza prosty model komputera i pokazuje bryłkę. Nie zawiera strony krzem.si na ekranie urządzenia.
- `quality.js` ogranicza rozdzielczość i reaguje na czas klatek. `compactViewport()` w `app.js` potrafi wybrać tryb statyczny według wysokości ekranu; nie jest to dowód słabości GPU.
- Siatki są cachowane według nazwy. Sprawdź, czy degradacja jakości faktycznie zmienia istniejącą geometrię/LOD, a nie tylko rozdzielczość nowych klatek.

Zachowaj treść, dostępność, przyciski, źródła, statyczny deploy i możliwość czytania bez JS. Możesz przebudować renderer i organizację assetów. **Brak zależności npm nie jest celem nadrzędnym.** Nie rób jednak migracji całego projektu do nowego frameworka wyłącznie dla efektu technicznego.

## 3. Kierunek wizualny i granice referencji

Referencja `references/concept.png` jest wzorcem atmosfery, nie gotową teksturą strony i nie źródłem naukowym. `references/current-desktop-mobile.webp` oraz `references/current-scenes.webp` pokazują prototyp, nie cel końcowy. Bez pakietu referencji użyj materiałów dostarczonych osobno; nie wymyślaj nieistniejących plików.

Paleta: głęboki grafit, przygaszona biel, srebrzyste i chłodne refleksy, oszczędny bursztyn. Duże, spokojne nagłówki; detale techniczne jako akcent. Materiały powinny być wiarygodne także na zatrzymanej klatce. Popraw geometrię, normalne, proporcje i światło, zanim dołożysz postprocessing.

Nie chcemy robota, świecącego mózgu, fioletowego „AI gradientu”, kosmicznego HUD-u, lawiny cząsteczek, plastikowych klocków ani jednolicie chromowanych przedmiotów. Zero ukrywania niedopracowanego modelu za bloomem, mgłą i grainem. Krzem nie ma wyglądać jak przezroczysty kwarc, diament ani bryła folii aluminiowej.

Nie traktuj wszystkich rozdziałów jako schematu „nagłówek po lewej, obracający się obiekt po prawej”. Hero może tak wyglądać, ale materia ma wypełnić kadr, tranzystor wyizolować zasadę działania, skala zanurzyć widza w strukturze, a finał wrócić do spokojnej kompozycji.

Polski tekst pozostaje prawdziwym HTML-em, poza niezbędnymi elementami tekstury ekranu w finale. Dbaj o polskie znaki, kontrast, czytelność na telefonie i brak mikrotekstu wymagającego powiększenia. Dobierz fonty z jasną licencją; nie dołączaj przypadkowych plików z systemu.

## 4. Architektura wykonania

### Baza

Pozostaw statyczny, semantyczny frontend. Preferowany kierunek dla warstwy premium: **ładowany na żądanie Three.js z WebGL 2**, glTF/GLB oraz rozsądnie przygotowane materiały. Dla sprzętu bez tej ścieżki działa pełna, estetyczna opowieść DOM z posterami — nie ekran błędu. Aktualna dokumentacja Three.js nie przewiduje WebGL 1 w `WebGLRenderer`; nie obiecuj jego obsługi w nowej warstwie [R1].

Możesz dodać bundler do dzielenia kodu i zarządzania zależnościami. Dobierz aktualne wersje po sprawdzeniu dokumentacji, przypnij je lockfile'em i aktualizuj polecenia uruchomienia. Nie dodawaj Reacta, Next.js, CMS-a ani backendu bez konkretnej potrzeby produktu.

Nie rozwijaj od zera pełnego silnika materiałów i loaderów, jeśli gotowe rozwiązanie pozwoli skupić się na jakości obrazu. `GLTFLoader` obsługuje standardowy przepływ pracy z modelami i rozszerzeniami kompresji [R2]. Kompresję tekstur KTX2/Basis stosuj po sprawdzeniu jakości, z poprawnym wykryciem wsparcia i obsługą błędów transkodowania [R3]. Uwzględnij koszt loaderów i dekoderów; nie dodawaj wszystkich „na zapas”.

### Rozdzielenie odpowiedzialności

Oddziel odczyt scrolla, reżyserię scen, zarządzanie zasobami, poziomy jakości i renderer. Jeden harmonogram animacji; żadnych konkurujących pętli w każdym rozdziale. Jedno aktywne płótno 3D. Warstwa tekstowa pozostaje niezależna od sukcesu inicjalizacji GPU.

Przykładowe moduły, do dostosowania do repo: `story/timeline`, `story/camera-rig`, `rendering/renderer`, `rendering/asset-manager`, `rendering/quality-controller`, `scenes/*`. Nie wprowadzaj nadmiernej architektury dla samej liczby plików.

Stan opowieści jest deterministyczną funkcją rozdziału, jego postępu i jawnej interakcji. Ambient może mieć osobny zegar. Cofanie scrolla nie może zależeć od odtworzenia wszystkich wcześniejszych animacji. Losowość ma stały seed. Ręczny stan tranzystora nie ginie przy jednym drobnym ruchu scrolla.

### Kamera i ciągłość

Scroll steruje pozycją kamery, punktem obserwacji, ewentualnie ogniskową i odsłanianiem elementów. Nie udawaj całego przelotu samym `scale()` modelu. Opisz dla każdego przejścia kadr wejścia, ruch, obiekt prowadzący wzrok i kadr wyjścia.

Można używać osobnych scen i świadomych cięć dopasowanych wizualnie. Nie trzeba utrzymywać jednego fizycznego świata od urządzenia do skali mikro; priorytetem jest spójny obraz, stabilna głębia i wydajność. Przeskok techniczny nie może wyglądać jak przypadkowe przenikanie niepowiązanych obiektów.

### Hybryda zamiast dogmatu real-time

Real-time zostaw dla bryłki, tranzystora i ujęć rzeczywiście zyskujących na interakcji. Ciężki proces przemysłowy lub makrodetal może być prerenderowany. Dla trudnego ujęcia wykonaj krótki test real-time kontra prerender i wybierz wariant według obrazu, czasu dekodowania, transferu i zachowania na mobile.

Nie zakładaj, że przewijanie filmu przez ustawianie `currentTime` automatycznie będzie płynne. Zweryfikuj przewijanie do przodu i do tyłu, skoki, buforowanie oraz Safari/iOS. Nie dekoduj całej sekwencji setek pełnorozdzielczych obrazów do pamięci. Dopuszczalna jest krótka sekwencja z ograniczonym buforem i posterem, ale dopiero po pomiarze. Porażka testu oznacza zmianę techniki, nie obniżenie standardu raportowania.

## 5. Produkcja assetów — część zadania, nie praca „na później”

Przygotuj realne zasoby: bryłkę, monokryształ/płytkę, model dydaktyczny tranzystora, mikrostrukturę, urządzenie do finału, materiały, światło i postery. Każdy zasób użyty w kodzie ma istnieć i być dostarczony albo mieć sprawdzony krok pobierania/builda.

Dopuszczalny i zalecany jest proceduralny pipeline offline, np. Blender sterowany Pythonem. Blender ma tryb pracy bez GUI i wykonywanie skryptów; agent może w ten sposób budować sceny i renderować zasoby [R4]. Proceduralność nie jest wadą — wadą jest brak kontroli artystycznej i pozostawienie bryły na poziomie szkicu.

Dla bryłki wykonaj wysokiej jakości model źródłowy, zoptymalizowaną wersję runtime, detale normalnych i roughness oraz oświetlenie studyjne. Zachowaj nierówne powierzchnie przełamu bez losowego, równomiernego „szumu trójkątów”. Obejrzyj cały obrót i różne kąty światła; piękno jednego kadru nie wystarcza.

Eksportuj modele jako GLB, a najbardziej wymagające ujęcia jako gotowe media w wybranych profilach. Materiały w Blenderze nie mogą zależeć wyłącznie od shaderów, które nie mają odpowiednika w eksporcie. Wypiecz potrzebne dane i porównaj obraz w przeglądarce. Zadbaj o prawidłowe przestrzenie barw: mapy koloru i mapy danych nie są traktowane tak samo [R5].

Pipeline ma zawierać źródła/skrypty, seed, wersje narzędzi, polecenia generowania oraz wynikowe pliki. Codzienny build frontendu nie powinien wymagać Blendera ani wielogodzinnego renderu. Duże pliki robocze trzymaj poza zwykłą historią Git, z opisanym sposobem pobrania; nie zakładaj automatycznej dostępności Git LFS na docelowym hostingu.

Dodaj `docs/ASSET_MANIFEST.md`: plik, scena, autor lub źródło, licencja, modyfikacje, narzędzie, rozmiar transferu, wymiary tekstur, liczba trójkątów, warianty jakości, sposób odtworzenia. Jeśli model pochodzi z zewnątrz, sprawdź prawo redystrybucji w publicznym repo. Nie obchodź znaków wodnych i nie pobieraj przypadkowych assetów z wyszukiwarki.

## 6. Storyboard produkcyjny

### 00 — hero / materiał

Cel: ciężki, niemal fotograficzny obiekt w spokojnym, muzealnym świetle. Powolny obrót, mała reakcja na mysz, wyraźny kształt i interesujący detal. Bez machania kursorem jak joystickiem. Pierwszy poster widoczny przed uruchomieniem 3D; przejęcie obrazu przez renderer bez błysku, zmiany proporcji i nagłego przeskoku ekspozycji.

Przejście: kamera zbliża się do wybranej powierzchni, tekst ustępuje, przełam wypełnia kadr i prowadzi do sceny materiału. Ujęcie ma sprawiać wrażenie wejścia do obiektu, nie powiększenia płaskiej ilustracji. Na telefonie zaprojektuj osobny kadr i bezpieczną przestrzeń dla nagłówka.

**Odbiór:** bryłka wygląda przekonująco na nieruchomym screenshotcie i w pełnym ruchu; powierzchnia nie przypomina regularnej siatki trójkątów; hero nie potrzebuje postprocessingu, żeby być interesujące.

### 01 — od materii do precyzji

Pokaż czytelne, rozdzielone etapy: materiał zawierający związki krzemu, redukcja/oczyszczanie, krystalizacja, monokryształ, płytka. Krótkie podpisy opieraj na `docs/SCIENCE.md` i zweryfikowanych źródłach. To wizualny skrót wieloetapowego procesu, a nie piasek przemieniony w procesor jednym rozbłyskiem.

Kontrast obrazu: nieregularność i faktura → kontrolowany blask procesu → idealna geometria → wypolerowana powierzchnia. Tęczowe odbicia mają być oszczędne i uzasadnione wyglądem powierzchni, nie neonową nakładką. Wzorzysty wafer oraz gotowy układ nie pojawiają się jako jedna czynność „wypalenia laserem”.

**Odbiór:** etapy dają się odczytać przy wolnym scrollu, zatrzymaniu i cofnięciu; brak kosztownego efektu, który zasłania samo wyjaśnienie.

### 02 — jeden przełącznik, dwa stany

Zastąp przypadkowe klocki świadomie zaprojektowanym przekrojem dydaktycznym. Warstwy i styki mają różne, wiarygodne materiały. Źródło, bramka i dren są czytelne. Podpis: model uproszczony, nie w skali.

Zmiana stanu ma pokazać różnicę działania, a nie tylko zamianę bursztynu na niebieski. Podświetlenie przepływu jest wyraźnie umowną wizualizacją. Nie pokazuj pola elektronów jako rzeczywistego nagrania. Jedna demonstracja wynika ze scrolla, potem można powtarzać ją przyciskiem i klawiaturą. Klik nie jest warunkiem dalszej podróży.

**Odbiór:** użytkownik rozumie, co się zmieniło, także w trybie lekkim i bez polegania wyłącznie na kolorze.

### 03 — przelot przez mikrostrukturę

Główny moment skali. Zacznij od związku z elementem poprzedniej sceny. Pokaż powtarzalne struktury, warstwy i połączenia, zanurz kamerę między nimi, a następnie odsłoń większy fragment układu.

Na potrzeby reżyserii rozpisz przynajmniej pięć kadrów: wejście, detal powtórzeń, wnętrze warstw, odsłonięcie złożoności, wyjście do chipu. Nie są to pięć obowiązkowych postojów; służą do projektowania ciągłego ruchu. Używaj instancji, LOD i przygotowanych detali. Nie próbuj fizycznie rysować miliardów tranzystorów.

Nie kopiuj dosłownych miejskich wieżowców z makiety. Architektura ma przywoływać mikroelektronikę: kanały, vias, połączenia, rytm struktur, warstwy. Zachowaj adnotację o artystycznym uproszczeniu; nie podawaj dokładnej skali ani porównania z ziarnem piasku bez uzasadnienia.

Tekst „To nie jest miasto. To fragment jednego układu.” pojawia się wtedy, gdy widz już doświadczył zmiany perspektywy. Nie nakładaj całego akapitu na najbardziej ruchliwy fragment.

**Odbiór:** realne poczucie drogi i głębi; brak teleportów, znikających powierzchni, clippingu, migotania cienkich linii i szarpnięć przy zawracaniu. Obracana płaska płytka nie spełnia tego kryterium.

### 04 — technologia staje się możliwościami

Zachowaj chip jako punkt odniesienia, zmieniaj kontekst: terminal, tworzenie obrazu, komputer, komunikacja, telefon. Nie buduj katalogu urządzeń ani przypadkowej osi czasu z niezweryfikowanymi datami. Hasła: „Liczyć. Tworzyć. Łączyć.”

Nie każda scena wymaga rozbudowanego 3D. O jakości decydują dopasowane przejścia, rytm i dobry detal. Tekst musi pozostać zrozumiały także po pominięciu animacji.

### 05 — od Si do SI

Przygotowana demonstracja: polecenie tekstowe → reprezentacja liczbowa → wybrane operacje → sprzęt → odpowiedź. Tekst i interakcja w DOM; warstwa graficzna wspiera narrację. Nie buduj backendu LLM tylko dla tej sekwencji.

„Model jest matematyczny. Obliczenia są fizyczne.” Dopowiedz rolę algorytmów, danych, energii i ludzi. Nie sugeruj, że sama bryłka tworzy inteligencję, ani że pokazujesz dosłowne myśli modelu. Wszystkie przykładowe dane są jawnie demonstracyjne.

### 06 — ekran wewnątrz ekranu

Zamknij pętlę: chip → fragment urządzenia → ekran pokazujący **tę samą identyfikację i hero krzem.si** → spokojny powrót do bryłki → Si / SI / krzem.si.

Preferowana prosta realizacja: dopasowana perspektywicznie powierzchnia ekranu z teksturą przygotowaną z rzeczywistego widoku strony w buildzie/QA, ewentualnie krótkim nagraniem lub ograniczonym render targetem. Zadbaj o zgodność kompozycji, światła i kadru; sama dowolna strona na monitorze nie wystarczy. W niskiej jakości użyj dopasowanego posteru.

Nie osadzaj rekurencyjnych iframe'ów z całą witryną. Nie proś użytkownika o nagrywanie ekranu. Nie uruchamiaj drugiej pełnej instancji strony dla tego efektu. Pętla jest wizualna i nie przewija automatycznie dokumentu do początku. „Przeżyj jeszcze raz” jest normalnym, opcjonalnym działaniem użytkownika.

**Odbiór:** na nagraniu da się rozpoznać powrót do tej samej strony; żadna część efektu nie wymaga uprawnień, zewnętrznego API ani nieograniczonej rekurencji.

## 7. Płynność: profile zamiast obietnicy „60 fps wszędzie”

Pełna treść i estetyka dla każdego wspieranego środowiska; intensywność animacji dostosowana do urządzenia. **To nie oznacza identycznego renderingu na każdym telefonie.**

Wprowadź trzy jasno testowalne profile:

- **Cinematic:** pełniejsza kamera i materiały, cel około 60 fps na wybranym, zapisanym sprzęcie referencyjnym. Postprocessing tylko z mierzalnym uzasadnieniem.
- **Balanced:** prostszy detal, niższa rozdzielczość, mniej efektów, cel stabilne około 30 fps tam, gdzie 60 nie jest osiągalne. Zachowaj najważniejsze momenty narracji.
- **Calm:** dopracowane postery, kompletna treść, działające interakcje dydaktyczne bez ciężkiego 3D. Brak przelotów i niekończącego się ambientu przy preferencji ograniczenia ruchu [R7].

Preferencje użytkownika mają pierwszeństwo. Nie utożsamiaj szerokości ekranu ani braku `deviceMemory` z wydajnością GPU. Dobierz kadr według viewportu, jakość według możliwości, preferencji i pomiarów. Uwzględnij oszczędzanie danych, gdy sygnał jest dostępny; jego brak nie dowodzi szybkiego łącza.

Degradacja powinna mieć histerezę, nie oscylować co sekundę. Obniżaj rozdzielczość, koszt efektów i LOD; dopiero potem przechodź do spokojnej wersji. Nie próbuj awansować co chwilę do wysokiej jakości. Jednorazowa kompilacja shadera i powrót z ukrytej karty nie mogą błędnie uruchamiać trwałej degradacji.

Mierz odstępy między rzeczywiście renderowanymi klatkami, czas pracy CPU oraz dostępne miary GPU. Samo wywoływanie `requestAnimationFrame` nie dowodzi, że użytkownik widzi taką liczbę klatek. Raportuj medianę, p95 i przycięcia, nie tylko średnie FPS. Pamięć GPU zwykle trzeba szacować z zasobów; nie nazywaj tego pomiarem całej pamięci urządzenia.

### Początkowe budżety projektu

Poniższe limity są założeniami inżynierskimi, nie uniwersalną gwarancją wydajności. Zmiana wymaga pomiaru i krótkiego uzasadnienia w `docs/PERFORMANCE.md`.

| Zakres | Cel początkowy |
|---|---|
| Zasoby niezbędne do pierwszego czytelnego widoku mobilnego | do 600 KiB transferu przy pustym cache, łącznie z posterem i fontami, jeśli są |
| Całość pobrana do pierwszego interaktywnego hero, razem z powyższym | do 3 MiB mobile / 5 MiB desktop; bez pozostałych rozdziałów |
| Pełna spokojnie przewinięta sesja | do 15 MiB mobile / 25 MiB desktop; nie pobieraj jej całej na wejściu |
| Limit DPR jako punkt startowy | do 1,5 cinematic; do 1,0 balanced, z dodatkowym budżetem pikseli |
| Tekstury | zwykle 1K mobile / 2K desktop; wyjątki tylko po porównaniu obrazu i kosztu |
| Rezydentne ciężkie sceny | aktywna + mały zapas następnej; osobno ograniczona pamięć podręczna |
| Liczba aktywnych rendererów | jeden |

Cel Core Web Vitals: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 na 75. percentylu rzeczywistych odwiedzin, osobno dla mobile i desktop [R6]. Przed publikacją raportuj osobno wyniki laboratoryjne. Lighthouse ani screenshot test nie dowodzą spełnienia terenowego INP ani płynności GPU.

### Zarządzanie zasobami

Najpierw treść i poster. Opcjonalny renderer dopiero później, bez czekania całej strony na assety. Nie pobieraj wszystkich modeli i filmów naraz. Przy szybkim przeskoku pomijaj niepotrzebne kolejki, anuluj lub ignoruj nieaktualne ładowania. Nie zakładaj, że jeden `requestIdleCallback` rozwiąże koszt dekodowania, uploadu i kompilacji.

Zwalniaj tekstury, bufory, materiały i zasoby dekoderów, gdy nie są potrzebne; nie usuwaj jednak wspólnych zasobów nadal używanych przez sąsiednią scenę. Ograniczenie liczby renderowanych pikseli, batchowanie i kontrola pamięci są częścią projektu, nie końcowym dodatkiem [R8].

Po ukryciu karty zatrzymaj rendering i media; po powrocie kontynuuj poprawny stan. Błąd modelu, dekodera, filmu lub utrata kontekstu ma prowadzić do gotowego posteru i treści, nie czarnego ekranu. Przejście między profilami nie powinno przestawiać czytelnika do innej części historii.

## 8. Interakcja i dostępność

Zachowaj natywne przewijanie. Żadnego `preventDefault()` na wheel/touchmove dla prowadzenia fabuły, sztucznego wygładzania z opóźnieniem, obowiązkowego „Start” ani czekania na koniec animacji przed dostępem do treści.

Nawigacja po rozdziałach i anchor links muszą działać przy klawiaturze, szybkim scrollu, wejściu bezpośrednim i powrocie przez Back/Forward. Przycisk wyłączenia animacji pozostaje dostępny; tryb spokojny jest pełnoprawnym designem. Dźwięk jest poza pierwszym zakresem; ewentualnie później, tylko po świadomym włączeniu.

Sprawdź zoom 200%, krótkie i poziome ekrany, safe areas, zmianę orientacji i rozmiaru paska przeglądarki mobilnej. Żadnego blokowania tekstu pod sceną fixed/sticky. Elementy sterujące mają czytelny focus, sensowne nazwy i odpowiedni obszar dotykowy. Żaden ważny komunikat nie może opierać się tylko na kolorze lub ciągłym ruchu.

## 9. Kolejność pracy i bramki jakości

### Etap A — audyt i najpierw jeden dopracowany fragment

Uruchom bazę, zarchiwizuj screeny, wypisz konkretne różnice względem briefu. Wybierz minimalną architekturę i przygotuj assety hero. Zrealizuj **hero + wejście w materiał**, od razu w cinematic, balanced i calm. Dodaj nagranie ruchu i porównanie przed/po.

Nie kończ na pisaniu audytu. Nie rozbudowuj wszystkich siedmiu scen, dopóki ten fragment nie pokaże wiarygodnego materiału, poprawnej kamery i płynnego przejęcia posteru. Bramka jakości nie wymaga każdorazowo czekania na odpowiedź właściciela: wykonaj uczciwą samoocenę, popraw widoczne problemy, przedstaw materiał do oceny. Pytaj tylko o decyzje rzeczywiście blokujące, np. płatny asset bez zgody na koszt.

### Etap B — tranzystor i skala

Zrealizuj dydaktyczny przełącznik i przejście do mikrostruktury. Sprawdź najcięższy przelot na docelowym profilu. Dopracuj pięć kadrów kontrolnych i cofanie. Uproszczenie techniczne ma zachować sens i wygląd, a nie usuwać całe „wow”.

### Etap C — finał i pozostała opowieść

Dostarcz rzeczywistą pętlę ekranu, pozostałe sceny materiału, świat oraz demonstrację AI. Zadbaj o spójność materiałów, koloru, typografii i rytmu całej strony. Ogranicz powtarzalny schemat layoutu. Sprawdź wszelkie przejścia między odmiennymi technikami renderowania.

### Etap D — kontrola produkcyjna

Pomiary, błędy assetów, ograniczony ruch, brak JS, problemy GPU, sieć, klawiatura, raport, build i dokumentacja deploya. Zaktualizuj testy, gdy zmiana architektury zmienia ich kontrakt; nie kasuj ich tylko po to, żeby raport był zielony. Wszystkie etapy dostarczaj jako sensowne, małe commity na gałęzi roboczej. Nie publikuj strony ani nie zmieniaj DNS bez osobnego polecenia właściciela.

## 10. Testy obrazu i ruchu — obowiązkowe dowody

Dodaj tryb deweloperski, np. `?scene=skala&progress=0.5&quality=balanced&freeze=1`, do deterministycznego ustawienia sceny, kamery i czasu ambientu. Konkretną składnię udokumentuj. To narzędzie QA, nie zamiennik testu natywnego scrollowania.

Dla hero, tranzystora, skali i finału wykonaj screeny pięciu postępów: 0%, 25%, 50%, 75%, 100%. Zrób odpowiedniki desktop i mobile oraz planszę porównawczą. Sprawdź również rzeczywiste przejścia między rozdziałami. Screeny mają pochodzić z uruchomionej strony, nie z generatora grafiki ani wyłącznie z Blendera.

Dostarcz nagranie 30–60 sekund zwykłego użycia na desktopie oraz krótkie mobilne. Oznacz środowisko nagrania. Sprawdź wolne przewijanie, szybki fling, zmianę kierunku w połowie ujęcia, kliknięcie nawigacji, zatrzymanie na dłuższą chwilę i powrót do ukrytej karty. Osobno testuj ciągłe użytkowanie przez kilka minut; krótki benchmark nie wykrywa każdego problemu z rozgrzewaniem i zasobami.

Uruchom automatyczne testy przynajmniej w dostępnych silnikach przeglądarek i z wyłączonym JS, ograniczeniem ruchu oraz symulowaną utratą kontekstu. Zapisz dokładne wersje, viewport, sposób akceleracji i zastosowane ograniczenia. Emulacja telefonu, WebKit w narzędziu testowym i rzeczywisty iPhone/Safari to różne testy.

Przed nazwaniem wydania produkcyjnym sprawdź fizyczny iPhone w Safari, słabszy Android w Chrome oraz laptop z grafiką zintegrowaną. Gdy ich nie masz, pokaż checklistę dla właściciela i wyraźne `NIEZWERYFIKOWANE`; nie twórz fikcyjnych wyników. W przypadku software renderingu nie wyciągaj wniosków o rzeczywistej wydajności telefonu.

## 11. Ostateczne kryteria odbioru

Realizacja jest gotowa dopiero, gdy materiały, kamera i zasoby są naprawdę podłączone, a nie zastąpione deklaracją w README. Weryfikujemy widoczny skok jakości hero, rzeczywisty przelot przez strukturę, rozpoznawalną pętlę ekranu oraz czytelną historię przy ograniczonym ruchu. Brak błędów w konsoli nie jest oceną estetyki.

Każdy etap raportuj trzema krótkimi odpowiedziami: **co faktycznie zmieniło się w obrazie, jaki dowód to pokazuje, jaki jest koszt/ryzyko na słabszym sprzęcie**. Nie oceniaj projektu samym „premium” lub „10/10”. Pokaż konkretne klatki i ruch oraz wskaż pozostałe odstępstwa.

Dostarcz:

- Kod i komplet używanych assetów, instrukcję odtworzenia oraz statyczny build.
- `docs/ART_DIRECTION.md`, `docs/ASSET_MANIFEST.md`, `docs/PERFORMANCE.md`, zaktualizowane `docs/SCIENCE.md` i `README.md`.
- Rzeczywiste screenshoty, nagrania, wyniki testów i `docs/qa/PREMIUM_REPORT.md` z warunkami pomiaru oraz listą nieweryfikowanych środowisk.
- Podsumowanie zmian i znanych ograniczeń; żadnych nieistniejących assetów, wymyślonych pomiarów i niejawnie płatnych zależności.

**Zacznij teraz od audytu i realizacji etapu A. Nie poprzestawaj na planie.**

## 12. Dokumentacja techniczna do sprawdzenia

Źródła sprawdzone przy przygotowaniu briefu 30.09.2026. Przy implementacji zweryfikuj je dla faktycznie użytych wersji. Budżety transferu, priorytety scen i kryteria artystyczne powyżej są decyzjami projektowymi, a nie cytowanymi standardami.

R1 — Three.js, WebGLRenderer: WebGL 2, zarządzanie rendererem, diagnostyka.
https://threejs.org/docs/pages/WebGLRenderer.html

R2 — Three.js, GLTFLoader: import glTF i obsługiwane rozszerzenia.
https://threejs.org/docs/pages/GLTFLoader.html

R3 — Three.js, KTX2Loader: transkodowanie tekstur i wykrywanie wsparcia.
https://threejs.org/docs/pages/KTX2Loader.html

R4 — Blender, Command Line Arguments: tryb background, render i skrypty Python; źródło wersjonowane 5.1, nie polecenie instalowania właśnie tej wersji.
https://docs.blender.org/manual/en/5.1/advanced/command_line/arguments.html

R5 — Three.js, Color Management: tekstury kolorów, dane i przestrzeń pracy.
https://threejs.org/manual/pages/color-management.html

R6 — web.dev, Web Vitals: progi i rozróżnienie pomiarów laboratoryjnych oraz terenowych.
https://web.dev/articles/vitals

R7 — MDN, prefers-reduced-motion: preferencja ograniczenia nieistotnych animacji.
https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

R8 — MDN, WebGL best practices: budżety zasobów, batchowanie i renderowanie.
https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
