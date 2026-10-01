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

W skali modelu (nm, test w `tests/core.test.mjs`): szerokość żebra 8, wysokość ponad izolacją 42, rozstaw żeber 42, rozstaw bramek 70, rozstaw ścieżek pierwszego metalu 52. Podziałka pod sceną jest liczona z kamery i jest prawdziwa dla płaszczyzny ostrości (punkt, na który patrzy kamera).

NIEZWERYFIKOWANE: długość bramki 20 nm (podana w streszczeniu artykułu IEDM 2014, Natarajan i in., „A 14nm logic technology featuring 2nd-generation FinFET…”, którego tekstu nie udało się otworzyć). Założone, bez źródła: grubość dielektryka bramki (2 nm) i warstwy TiN (1,5 nm), szerokość dystansów (8 nm), wysokość bramki i jej nasadki, kształt i wymiary epitaksjalnych obszarów źródła i drenu, wymiary kontaktów, przelotek i ścieżek (poza ich rozstawem), głębokość izolacji (40 nm).

Uproszczenia:
- Wszystkie części to prostopadłościany (obszary źródła i drenu obrócone o 45°, by przypominały fasetowaną epitaksję). Prawdziwe żebra są lekko zwężone ku dołowi i zaokrąglone u góry; przekrój pokazuje tylko zaokrąglone krawędzie.
- Dielektryk między poziomami metalu jest pominięty, żeby było widać elementy. Kolory materiałów są umowne (miedź i TiN zbliżone do prawdziwych barw, reszta rozróżniona dla czytelności).
- Kanał (włączony) to świecąca cienka warstwa przy powierzchni żebra pod bramką, po trzech stronach żebra; jasność i kolor są umowne. Ciemniejszy odcień krzemu pod źródłem i drenem oznacza silne domieszkowanie schematycznie, bez prawdziwego profilu.
- Punkty płynące od źródła to umowna wizualizacja przepływu nośników, nie ich liczba, prędkość ani tor. W stanie wyłączonym zatrzymują się przed bramką; prądy upływu pominięto.
- Głębia ostrości, wygaszanie krawędzi próbki i światła są środkami obrazu.
