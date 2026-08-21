# Losy Świata — roadmapa strategiczna

Dokument projektowy. Opisuje uzgodniony kierunek rozwoju gry; nie jest jeszcze specyfikacją implementacyjną ani listą funkcji wdrożonych w aktualnej wersji.

## Zasady projektowe

1. Każda liczba musi prowadzić do czytelnej decyzji gracza albo być widocznym skutkiem decyzji.
2. Gra nie zakłada pełnej wiedzy o przeciwniku. Dane mają przedział szacunku i poziom wiarygodności.
3. Jedna tura to jeden kwartał. Systemy zmieniają się w różnym tempie: mobilizacja w kwartałach, gospodarka w latach, demografia w dekadach.
4. Nie budujemy księgowości ani arkusza uzbrojenia. Szczegóły są modelowane przez kilka zrozumiałych wskaźników i ich konsekwencje.
5. Historyczne roszczenie nie jest automatycznym prawem do wojny; wpływa na koszty polityczne, opór, dyplomację i narrację.

## Fundament: zdolność państwowa

Zamiast jednej liczby „siły” państwo ma profil:

- potencjał wojskowy;
- potencjał gospodarczy;
- bezpieczeństwo energetyczne i surowcowe;
- logistyka oraz infrastruktura;
- sprawność instytucji;
- zgoda społeczna i spójność regionalna;
- odporność informacyjna;
- dostęp do danych, cyber i przestrzeni kosmicznej.

Informacje o przeciwniku są przedstawiane jako szacunki, np. „48–66, niska wiarygodność”, a nie jako fałszywie precyzyjne liczby. Wewnętrzny stan scenariusza jest deterministyczny dla seeda, ale ukryty tam, gdzie wywiad nie ma dobrej wiedzy.

## Demografia, struktura społeczna i migracja

Każde państwo ma uproszczoną piramidę wieku:

- dzieci;
- młodzi dorośli;
- główna siła robocza;
- starsi pracujący;
- seniorzy.

Demografia aktualizuje się rocznie i pokazuje prognozy na 10 oraz 25 lat. Wpływa na manpower, rynek pracy, bazę podatkową, obciążenie usług publicznych i odporność na straty.

Społeczeństwo opisują również społeczności kulturowo-językowe: większość, mniejszości historyczne, diaspora i świeżo przybyłe grupy. Dla nich znaczenie mają udział w populacji, koncentracja regionalna, integracja, więzi zewnętrzne, pozycja ekonomiczna oraz poczucie bezpieczeństwa. To nie są statyczne „narodowości”: zmieniają je migracja, naturalizacja, asymilacja, demografia, edukacja, wojna i polityka państwa.

Migracja ma dwa niezależne wymiary:

- atrakcyjność i dostępność kierunku: bezpieczeństwo, granica, transport, praca, diaspora, odległość i prawo wjazdu;
- trudność integracji: język, sieci społeczne, dystans norm, mieszkania, rynek pracy i sprawność instytucji.

Wojna w sąsiednim kraju wywołuje presję graniczną. Przyjęcie ludności może w dłuższym okresie wzmacniać demografię i gospodarkę, lecz krótkoterminowo obciąża usługi, mieszkania, administrację i spójność. Zagrożeniem nie są automatycznie sami migranci, lecz możliwość wykorzystania rzeczywistych napięć przez obce operacje wpływu.

## Manpower, prawo i mobilizacja

Manpower nie jest równy populacji:

`realny manpower = dostępni ludzie × wyszkolenie × wyposażenie × zdolność utrzymania`

Model obejmuje armię czynną, rezerwy przeszkolone, możliwy pobór, instruktorów, specjalistów i zdolność administracji do mobilizacji. Utrzymanie gotowej armii kosztuje żołd, ćwiczenia, amunicję, remonty, instruktorów oraz ludzi wyjętych z gospodarki.

Prawo jest zestawem realnych możliwości państwa: model służby, zasady poboru, poziom mobilizacji, tryb nadzwyczajny, polityka migracyjna i naturalizacji oraz zdolność egzekwowania decyzji.

Mobilizacja ma trzy postacie:

- ukryta: ćwiczenia rezerw, zapasy, remonty i przygotowanie infrastruktury; jest wolna, kosztowna i możliwa do wykrycia;
- jawna: szybsza gotowość, wyraźny koszt społeczny i dyplomatyczny;
- pełna: maksymalna obrona kosztem gospodarki, wolności działania i stabilności.

## Gospodarka, energia i budżet

Gospodarka jest uproszczona do pięciu powiązanych zasobów:

- produkcja;
- finanse;
- energia;
- surowce;
- handel i transport.

Widoczny dla gracza kwartalny bilans:

`dochody publiczne − wydatki cywilne − armia − inwestycje − obsługa długu = saldo`

Dochody zależą od potencjału gospodarki, skuteczności poboru, polityki fiskalnej, sprawności instytucji i sytuacji wojennej. Gracz wybiera decyzje, nie mikro-stawki: zwykły budżet, daninę wojenną, dług, cięcia, import lub pomoc zagraniczną.

## Spójność, polityka wewnętrzna i informacja

Nie ma pojedynczego wskaźnika „poparcia”. Są cztery filary:

- zgoda społeczna — tolerancja kosztów i gotowość do współpracy;
- poparcie dla konkretnej wojny;
- zaufanie instytucjonalne;
- spójność społeczna i regionalna.

Odporność informacyjna zależy od zaufania, polaryzacji, jakości komunikacji kryzysowej, edukacji, pracy instytucji i realnych napięć. Propaganda oraz psyops nie są losowym minusem, lecz próbą wykorzystania istniejących problemów: kosztów wojny, energii, migracji, poboru albo porażek.

Polityka wewnętrzna ma działać przez filary państwa — społeczeństwo, armię, gospodarkę/elity oraz regiony/instytucje — bez symulatora kampanii partyjnej i wyborów.

## Wojna, logistyka i zdolności militarne

Realna siła frontu nie wynika tylko z liczby wojsk:

`siła frontu = dostępne siły × gotowość × zaopatrzenie × dowodzenie × warunki operacyjne`

Logistyka obejmuje paliwo, amunicję, magazyny, transport, infrastrukturę, dystans, liczbę frontów i zakłócenia przeciwnika.

Zdolności militarne są pulami, nie arkuszem pojedynczych sztuk sprzętu:

- siły lądowe, artyleria i pancerne;
- lotnictwo i obrona powietrzna;
- rakiety dalekiego zasięgu;
- drony i amunicja krążąca;
- rozpoznanie, dowodzenie i łączność;
- marynarka oraz obrona wybrzeża;
- odstraszanie nuklearne.

Każda pula ma ilość, jakość, gotowość, zapasy, remonty i koszt utrzymania. Produkcja krajowa potrzebuje czasu, linii produkcyjnych i ludzi; zakupy zagraniczne wymagają finansów, dostawcy, terminu dostawy, szkolenia oraz integracji.

## Cyber i przestrzeń kosmiczna

Cyber obejmuje obronę infrastruktury, wywiad, przygotowane dostępy, działania zakłócające, sabotaż cyfrowy oraz atrybucję i ryzyko odwetu. Nie jest przyciskiem „zhakuj przeciwnika”; wymaga długiego budowania zdolności i obrony.

Satelity oraz dostęp do usług kosmicznych zapewniają obserwację, łączność, nawigację, pogodę i wczesne ostrzeganie. Państwa mogą mieć:

- własne systemy;
- dostęp komercyjny;
- dostęp sojuszniczy;
- ograniczony albo zerowy dostęp.

Istotna jest odporność na zakłócanie, utratę stacji naziemnych i zależność od cudzych konstelacji.

## Regiony, okupacja i legitymizacja

Region może łączyć wiele tagów: port, energia, rafineria, przemysł, żywność, węzeł logistyczny, stolica, lotnisko lub surowce. Wysoka wartość regionu oznacza silniejszą reakcję obrońcy, koszt zdobycia i integracji oraz znaczenie dyplomatyczne. Kumulacja tagów ma malejące przyrosty, aby nie tworzyć jednego obowiązkowego „supercelu”.

Casus belli jest narracją polityczną — historyczne roszczenie, ochrona ludności, zagrożenie bezpieczeństwa, złamanie traktatu albo incydent — a nie bezwarunkowym uprawnieniem. Wpływa na poparcie, reputację, sankcje, koalicje i opór okupowanej ludności.

## Dyplomacja

Późniejszy system dyplomacji ma obejmować pakty, gwarancje, sankcje, pomoc, handel uzbrojeniem, dostęp do baz, wymianę danych wywiadowczych i satelitarnych, wspólną obronę cybernetyczną, mediację oraz koalicje.

## Zalecana kolejność wdrażania

1. Zdefiniować model zdolności państwowej oraz czytelne źródła i niepewność danych.
2. Wdrożyć koszt utrzymania armii, rezerwy, manpower i mobilizację jako pierwszą grywalną pętlę.
3. Dodać uproszczony kwartalny budżet, energię oraz podstawową logistykę.
4. Dodać lekką demografię i prognozy.
5. Dodać strukturę społeczną, migrację oraz odporność państwa.
6. Rozbudować zdolności militarne, produkcję i zakupy.
7. Dodać regiony strategiczne, legitymizację wojny i okupację.
8. Dodać cyber, satelity i dyplomację jako systemy spinające całość.
