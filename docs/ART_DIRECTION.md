# Kierunek kolejnej iteracji

Celem jest filmowa opowieść, a nie seria modułów SaaS. Ciemny grafit, złamana biel, srebrzysty krzem i oszczędny bursztyn. Typografia i czarna przestrzeń nadają rytm; siła przekazu wynika ze skali materii, nie ze świecących robotów.

## Obecna wersja a cel wizualny

Obecne proceduralne sceny pozwalają sprawdzić flow, sterowanie i wydajność. Są uproszczonymi ilustracjami. Nie należy przedstawiać screenshotów jako finalnego odpowiednika wygenerowanej makiety.

Kolejny największy przyrost jakości da dopracowanie bryłki krzemu: bardziej nieregularne płaszczyzny przełamu, subtelne rysy, poprawne odbicia studia, model offline o małej liczbie trójkątów oraz osobne tekstury o ograniczonej rozdzielczości. Krzem nie powinien przypominać przezroczystego kwarcu.

Scenę skali trzeba zmienić z ogólnego pola struktur w świadomie wyreżyserowany przelot nad warstwami mikroelektroniki. Należy zachować czytelność tekstu i uniknąć dosłownych wieżowców. Wersja produkcyjna powinna mieć merytorycznie sprawdzony przekrój tranzystora i oznaczone warstwy materiałów.

## Docelowy rytm

Hero powolny, refleksy dyskretne. Przejście do materiału przybliża powierzchnię, potem przedstawia rozdzielone etapy przemysłowe. Tranzystor zatrzymuje akcję na chwilę eksperymentu. Skala przyspiesza oddalenie. Historia urządzeń przekłada technologię na możliwości człowieka. AI odsłania liczby pod interfejsem. Finał zamyka pętlę: urządzenie z widoczną stroną → bryłka → Si/SI/krzem.si.

Nie wymagamy żadnego kliku do kontynuacji. Scroll do przodu i do tyłu jest natywny. Na słabych urządzeniach opowieść ma zachować znaczenie nawet bez zmian kamery.

## Rozbudowa renderera

Aktualny renderer nie wczytuje glTF ani plików HDR. Są dwie uczciwe ścieżki: eksport nowych siatek do istniejącego formatu buforów i poszerzenie shadera albo osobny, lazy-loaded renderer oparty o Three.js. Nie należy dokładać biblioteki do krytycznego pierwszego renderu bez pomiaru. Aktualna warstwa HTML i tryb zapasowy powinny zostać niezależne.

Prerenderowane filmy mogą zastąpić najbardziej wymagające ujęcia. Najpierw trzeba przetestować płynność seekowania na Safari/iOS i pamięć, a nie od razu pobierać setki klatek do canvasu. Rozdział ładuje najwyżej bieżące zasoby i niewielki zapas następnych. Poster jest widoczny od pierwszego renderu.

## Warunki przed publikacją wersji premium

Test fizycznego iPhone'a w Safari, telefonu z Androidem o małej wydajności, Windowsa z integrą i Chrome/Firefox. Profilowanie czasu klatki, czasu do treści i zużycia pamięci. Przegląd czytnikiem ekranu, klawiaturą i przy powiększeniu 200%. Kontrola claimów naukowych. Dopiero potem opcjonalny dźwięk, uruchamiany świadomie przez użytkownika.
