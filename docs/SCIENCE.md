# Źródła i granice wizualizacji

Weryfikacja źródeł: 30 września 2026. Teksty na stronie są krótkimi, autorskimi podsumowaniami, a nie cytatami z materiałów poniżej.

1. Royal Society of Chemistry, Silicon: liczba atomowa 14, masa względna 28,085, metaliczny niebieskoszary połysk, występowanie w związkach i konieczność oczyszczania materiału elektronicznego. https://periodic-table.rsc.org/element/14/silicon
2. ASML, Microchip basics: tranzystory, mikroelektronika i zastosowania. https://www.asml.com/en/technology/all-about-microchips/microchip-basics
3. ASML, Semiconductor manufacturing process steps: wieloetapowe tworzenie struktur na płytce. https://www.asml.com/en/company/stories/2021/semiconductor-manufacturing-process-steps
4. ASML, Lithography principles: rola litografii, nie pojedyncze wypalanie kompletnego procesora laserem. https://www.asml.com/en/technology/lithography-principles
5. NVIDIA, Why GPUs are great for AI: równoległe przetwarzanie i obliczenia sieci neuronowych. Materiał producenta, nie neutralny benchmark porównawczy. https://blogs.nvidia.com/blog/why-gpus-are-great-for-ai/
6. NIST, CODATA 2022, „lattice parameter of silicon”: a = 5,431 020 511(89) × 10⁻¹⁰ m (sprawdzone 1 października 2026). Strona nie podaje warunków (temperatura, próżnia); używamy wartości bez poprawek. https://physics.nist.gov/cgi-bin/cuu/Value?asil
7. Wikipedia, Diamond cubic: dwie przenikające się sieci fcc przesunięte o ¼ krawędzi komórki w każdym kierunku, 8 atomów w komórce konwencjonalnej, odległość najbliższych sąsiadów √3/4 stałej sieci; tę strukturę ma krzem. Sprawdzone 1 października 2026; zgodne ze źródłem 7a. https://en.wikipedia.org/wiki/Diamond_cubic
   7a. MSEStudent, Diamond Cubic Unit Cell: 8 atomów w komórce, 4 najbliższych sąsiadów w układzie tetraedrycznym, odległość a·√3/4, krzem wśród przykładów. Materiał edukacyjny. https://msestudent.com/diamond-cubic-unit-cell/
8. PVA TePla, Czochralski Process: polikrystaliczny krzem topi się w tyglu kwarcowym, obracające się ziarno monokrystaliczne zanurza się w roztopie i powoli wyciąga; kryształ rośnie z orientacją sieci ziarna. Materiał producenta urządzeń. https://www.pvatepla.com/products-technologies/crystal-growth/czochralski-process/

## Sieć krystaliczna w rozdziale 01 (`src/scripts/scenes/lattice-math.js`)

Prawdziwe, sprawdzone testem (`tests/core.test.mjs`): stała sieci a = 0,5431020511 nm (źródło 6), komórka z 8 atomami: węzły fcc (0,0,0), (0,½,½), (½,0,½), (½,½,0) i te same przesunięte o (¼,¼,¼) (źródła 7 i 7a), każdy atom wewnątrz ma dokładnie 4 sąsiadów w odległości a·√3/4 ≈ 0,2352 nm, kąty między wiązaniami tetraedryczne (cos = −⅓). Ujęcie końcowe patrzy wzdłuż kierunku [110]; najbliższe kolumny atomów leżą 3a/8 ≈ 0,204 nm od osi kanału (wyliczone z geometrii i sprawdzone testem, nie z literatury). Podziałka pod sceną jest liczona z kamery i jest prawdziwa dla płaszczyzny 2 nm przed kamerą, która jest też jedyną ostrą płaszczyzną obrazu; w perspektywie bliższe atomy wyglądają na większe, dalsze na mniejsze.

Uproszczenia (opisane też w podpisie pod sceną):
- Model kulkowo-pręcikowy: atomy nie są twardymi kulkami, a wiązania nie są prętami. Promień kulki (0,022 nm) i pręta (0,0045 nm) są umowne, dobrane do czytelności, nie są promieniem atomowym ani kowalencyjnym.
- Ziarna polikryształu mają w obrazie ok. 2–3 nm. W prawdziwym krzemie polikrystalicznym ziarna są o rzędy wielkości większe; dokładnego zakresu nie podajemy (NIEZWERYFIKOWANE). Orientacja ziarna to ta sama sieć obrócona wokół środka ziarna: skrót wizualny, nie model granic ziaren. Atomy, które po obrocie wypadłyby poza swoją komórkę Voronoia, są w polikrysztale ukryte, więc granice wyglądają jak wąskie szczeliny.
- Front krystalizacji jest schematyczny. W metodzie Czochralskiego (źródło 8) monokryształ rośnie z roztopionego krzemu na ziarnie; w obrazie ziarna stałego polikryształu „obracają się” do jednej orientacji za płaszczyzną frontu, która przesuwa się od dołu kadru do góry. Tak nie przebiega żaden proces; to skrót od nieuporządkowanego materiału do jednego kryształu. Bursztynowe pasmo przy froncie i drganie atomów w nim to umowny znak gorącej granicy ciecz–ciało stałe, nie temperatura ani rzeczywista amplituda drgań.
- Ruch kamery, mgła, głębia ostrości (rozmycie jak w obiektywie, model cienkiej soczewki) i przyciemnienie przy tekście są środkami obrazu, nie właściwościami kryształu. W tej skali nie ma optycznego zdjęcia: to rozmycie niczego nie mierzy.

Krzem jest ważnym podłożem współczesnej elektroniki, a nie jedynym materiałem układu ani samodzielną przyczyną istnienia AI. Nie twierdzimy, że wszelkie komputery w historii lub wszystkie możliwe przyszłe komputery są krzemowe.

Użyte 0/1 to abstrakcyjne stany poglądowego przełącznika. Nie definiują napięć ani zachowania konkretnej bramki logicznej. W MOSFET przewodzenie nie jest idealnie zero-jedynkowe; ilustracja pomija charakterystyki analogowe i prądy upływu.

Geometria tranzystora jest uproszczona i nie jest rysunkiem produkcyjnym. Struktury układu są artystyczne i nie mają fizycznej podziałki. Akcenty świetlne nie przedstawiają rzeczywistych świecących elektronów. Etapy produkcji materiału są skondensowane. Przykład AI nie pokazuje wewnętrznego rozumowania ani rzeczywistego śladu obliczeń modelu.

## Tranzystor FinFET w rozdziale 02 (`src/scripts/scenes/transistor-math.js`)

Źródła (sprawdzone 1 października 2026):

9. Intel, M. Bohr, „14 nm Technology Announcement”, 11 sierpnia 2014 (slajdy w pakiecie prasowym): rozstaw żeber 42 nm, rozstaw bramek 70 nm, rozstaw ścieżek 52 nm, wysokość żebra ponad izolacją 42 nm, schemat bramki obejmującej żebro (metal gate, cienka warstwa dielektryka, Si substrate), zdjęcia TEM żeber. https://download.intel.com/newsroom/kits/14nm/pdfs/Intel_14nm_New_uArch.pdf
10. Intel, M. Bohr, „14 nm Process Technology: Opening New Horizons” (IDF 2014): „8 nm Fin Width, 42 nm Fin Pitch”. https://www.intel.com/content/dam/www/public/us/en/documents/technology-briefs/bohr-14nm-idf-2014-brief.pdf
11. EE Times, „Intel, IBM Dueling 14nm FinFETs”: żebra 42 nm wysokości i 8 nm szerokości (potwierdzenie źródeł 9–10). https://www.eetimes.com/intel-ibm-dueling-14nm-finfets/

W skali modelu (nm, test w `tests/core.test.mjs`): szerokość żebra 8, wysokość ponad izolacją 42, rozstaw żeber 42. Model ma jedną bramkę (w prawdziwym układzie bramki powtarzają się co 70 nm) i nie pokazuje poziomów metalu; podpis pod sceną twierdzi skalę tylko dla żeber. Podziałka pod sceną jest liczona z kamery i jest prawdziwa dla płaszczyzny ostrości (punkt, na który patrzy kamera).

NIEZWERYFIKOWANE: długość bramki 20 nm (podana w streszczeniu artykułu IEDM 2014, Natarajan i in., „A 14nm logic technology featuring 2nd-generation FinFET…”, którego tekstu nie udało się otworzyć). Założone, bez źródła: grubość dielektryka bramki (2 nm) i warstwy TiN (1,5 nm), szerokość dystansów (8 nm), wysokość bramki i jej nasadki, kształt i wymiary epitaksjalnych obszarów źródła i drenu, wymiary kontaktów, głębokość izolacji (40 nm), położenie obszarów źródła i drenu (35 nm od środka bramki).

Uproszczenia:
- Żebra są narysowane jako zwężające się ku górze (10 nm u podstawy, 8 nm w połowie wysokości, 6 nm pod zaokrąglonym wierzchołkiem); dokładny profil jest założony. Źródło i dren mają fasetowany profil („diament”) epitaksji, bramka, dystanse, nasadka i kontakty są prostopadłościanami z zaokrąglonymi krawędziami.
- Bramka, jej warstwy, dystanse, nasadka i kontakty są pokazane jak przydymione szkło, a epitaksja jako półprzezroczysty kryształ, żeby było widać żebra i kanał. W rzeczywistości są nieprzezroczyste. Na powierzchni żebra w zbliżeniu widać umowny wzór płaszczyzn sieci krzemu (okres a = 0,543 nm).
- Pominięto dielektryk wokół bramki i kontaktów, cienkie bariery kontaktów, sąsiednie bramki oraz poziomy metalu, żeby było widać elementy. Kolory materiałów są umowne (TiN zbliżony do prawdziwej barwy, reszta rozróżniona dla czytelności). Szklane części stoją 0,5 nm nad izolacją (czysto techniczne: inaczej migotały na jej powierzchni).
- Kanał (włączony) to świecąca cienka warstwa przy powierzchni żebra pod bramką, po trzech stronach żebra; jasność i kolor są umowne. Ciemniejszy odcień krzemu pod źródłem i drenem oznacza silne domieszkowanie schematycznie, bez prawdziwego profilu.
- Jasne punkty ze smugami płynące po ścianach i wierzchu żeber od źródła do drenu to umowna wizualizacja przepływu nośników, nie ich liczba, wielkość, prędkość ani tor. W stanie wyłączonym gromadzą się przed bramką; prądy upływu pominięto.
- Sekwencja przełączenia (impuls w kontakcie bramki, rozjaśnienie bramki, kanał zapalający się od źródła do drenu; przy wyłączeniu zanik od strony drenu) jest umowną choreografią, nie przebiegiem czasowym tranzystora (prawdziwe przełączenie trwa pikosekundy).
- Głębia ostrości, wygaszanie krawędzi próbki i światła są środkami obrazu.

## Połączenia nad tranzystorami w rozdziale 03 (`src/scripts/scenes/scale-math.js`)

Źródła (sprawdzone 1 października 2026):

12. Intel, M. Bohr, „14 nm Technology Announcement” (źródło 9): minimalny rozstaw połączeń 52 nm; przekrój SEM połączeń 14 nm z poziomami na przemian w poprzek i wzdłuż kadru.
13. Microwave Journal, „Intel & IBM detail 14 nm FinFET strategies in late-news papers at IEDM 2014”: dwa poziomy połączeń z izolacją powietrzną o minimalnym rozstawie 80 i 160 nm; u IBM 15 poziomów miedzi. https://www.microwavejournal.com/articles/23268-intel-ibm-detail-14-nm-finfet-strategies-in-late-news-papers-at-iedm-2014
14. Wikipedia, Interconnect (integrated circuits): najwyższe poziomy są najgrubsze, najszersze i najrzadziej rozstawione, najniższe cienkie i gęste; połączenia pionowe to przelotki (vias); między poziomami jest dielektryk; najbardziej złożone układy (2018) mają ponad 15 poziomów. https://en.wikipedia.org/wiki/Interconnect_(integrated_circuits)
15. Semiconductor Digest (Chipworks), „IEDM 2017: Intel’s 10nm Platform Process”: 13 poziomów metalu, kobalt w dwóch najniższych. https://sst.semiconductor-digest.com/chipworks_real_chips_blog/2017/12/18/iedm-2017-intels-10nm-platform-process/

W modelu (test w `tests/core.test.mjs`): 11 poziomów, rozstawy 52, 52, 52, 80, 80, 160, 160 nm z procesu 14 nm (źródła 12–13), kierunek ścieżek zmienia się z poziomu na poziom, rozstaw rośnie ku górze, przelotki tylko tam, gdzie oba sąsiednie poziomy mają metal. Podziałka pod sceną jest liczona z kamery dla płaszczyzny ostrości, od dziesiątek nanometrów do milimetrów.

NIEZWERYFIKOWANE / założone: rozstawy powyżej 160 nm (320, 640, 1280, 4000 nm), wszystkie grubości (stosunek grubości do szerokości 1,5–2), wysokości przelotek, długości odcinków i przerw, gęstość przelotek, zajętość torów na trzech najwyższych poziomach (co drugi tor, na najwyższym co trzeci i bez przerw), wymiary chipu (4 × 3 mm, umowne), jego plan (bloki logiki, pamięci i analogowe/IO, pierścień padów, siatka zasilania co 100 µm) i grubość (0,3 mm). Tekstura logiki to routing ze sceny w zmniejszeniu, nie prawdziwy układ komórek; połysk bloków pamięci jest umowny.

Uproszczenia:
- Dielektryk wypełniający przestrzeń między ścieżkami jest usunięty (jak na zdjęciach SEM wytrawionych połączeń), bariery i nasadki pokazane tylko jako cienkie krawędzie i inny połysk wierzchu.
- Poziomy „narastają” w kolejności produkcji; tempo i to, że metal na drodze kamery pojawia się dopiero za nią, są umowne.
- Najniższe poziomy mają kolor stali/grafitu (kobalt lub wolfram w nowszych procesach, źródło 15), wyższe miedziany; kolory są przybliżone.
- Poza kwadratem z prawdziwą geometrią każdy poziom jest płaską teksturą o tym samym rozstawie; z daleka powierzchnia chipu to tekstura z planem bloków. Plan, bloki i pady nie przedstawiają konkretnego układu.
- Światło, mgła, przyciemnienie w głębi i głębia ostrości są środkami obrazu.

## Urządzenie w rozdziale 04 (`src/scripts/scenes/world-math.js`)

Ogólny, umowny model urządzenia podobnego do telefonu, bez marki i bez wzorowania się na konkretnym produkcie. W skali jest tylko chip (4 × 3 mm, ten sam co w rozdziale 03); obudowa chipu, płytka, części, bateria, rama, ekran i szkło mają przybliżone, typowe wymiary (NIEZWERYFIKOWANE jako wymiary żadnego produktu). Ścieżki, pola lutownicze, układy i elementy bierne na płytce są wygenerowane (ziarno), nie są projektem prawdziwej płytki. Kolejność składania jest umowna (rozłożony widok, nie proces montażu). Ekran pokazuje prawdziwe obliczenie (szereg Leibniza dla π liczony na żywo w przeglądarce), plakat strony odsłaniany wiersz po wierszu i przykładową wymianę wiadomości. Podziałka jest prawdziwa dla płaszczyzny ostrości (od setek µm do kilku cm). Bursztynowa obwódka wokół chipu jest znacznikiem dla oka, a prześwietlenie urządzenia na końcu rozdziału to zabieg narracyjny (prawdziwy ekran nie jest przezroczysty).

## Akcelerator i obliczenie w rozdziale 05 (`src/scripts/scenes/ai-math.js`)

Demonstracja nie łączy się z żadnym modelem. Liczby w okienku i w warstwie nad chipem to jedna mała,
prawdziwie policzona warstwa sieci: y = σ(W·x + b), sześć wejść, macierz 6 × 6 i przesunięcia
wygenerowane z ziarna (nie są wagami żadnego modelu). Test sprawdza, że wynik liczy się tak samo
niezależnie i że tekst w HTML (dla czytelników bez JS) jest identyczny z wyliczonym. Odpowiedź
(„Wszystko zaczęło się od rzeczy…”) jest zapisana na stałe; nie wynika z tych liczb. Etapy
(prompt, liczby, operacje, sprzęt, odpowiedź) pokazują kolejność, nie czasy prawdziwego modelu.
Płytka jest ogólną, umowną płytką akceleratora (obudowa z pokrywą, sześć modułów pamięci obok
układu, stopnie zasilania, kondensatory, złącze krawędziowe), bez marki i bez wymiarów konkretnego
produktu (NIEZWERYFIKOWANE). W skali jest tylko chip (4 × 3 mm, ten sam co w rozdziałach 03 i 04).
Nici od macierzy do chipu i impulsy na ścieżkach (do pamięci i do złącza krawędziowego) są ilustracją przepływu danych, nie symulacją sygnałów ani prawdziwym rozkładem połączeń. Podziałka jest
prawdziwa dla płaszczyzny ostrości.

## Finał w rozdziale 06 (`src/scripts/scenes/finale-math.js`)

Nic nowego do udowodnienia. Ten sam chip i ta sama umowna płytka akceleratora co w rozdziale 05,
potem to samo ogólne, umowne urządzenie co w rozdziale 04 (bez marki, w skali tylko chip). Ekran
urządzenia pokazuje zrzut tej strony (jej hero tak, jak widzi go telefon), nie wymyśloną
grafikę. Bryłka na końcu to ta sama bryłka z początku strony (ten sam model i to samo studio);
„spotkanie” bryłki na ekranie z prawdziwą jest zabiegiem kamery, nie zjawiskiem fizycznym.
Podziałki tu nie ma: nic w tym rozdziale nie jest pokazane w skali.

