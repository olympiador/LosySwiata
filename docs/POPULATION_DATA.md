# Początkowa ludność regionów

Nowe partie strategiczne korzystają z GHS-POP R2023A, epoka 2020, zamiast jednolitej gęstości zaludnienia kraju.

Źródło: Schiavina, Freire, Carioli i MacManus, European Commission Joint Research Centre, [GHS-POP R2023A](https://data.jrc.ec.europa.eu/dataset/2ff68a52-5b5b-4a22-8f40-c41da8332cfe).

Archiwum: `GHS_POP_E2020_GLOBE_R2023A_4326_30ss_V1_0.zip`, dostępne w [repozytorium JRC](https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2020_GLOBE_R2023A_4326_30ss/V1-0/).

## Przeliczenie

1. Generator przypisuje komórki źródłowe według ich środka geograficznego i sumuje osoby z siatki 30 sekund kątowych do komórek mapy gry, 5 minut kątowych. Nie uśrednia gęstości i nie mnoży liczby mieszkańców przez powierzchnię.
2. Silnik sumuje komórki w granicach sektorów. Dotyczy to zarówno regionów administracyjnych, jak i sektorów podzielonych przez grę.
3. Udziały sektorów są normalizowane do początkowej ludności kraju używanej przez grę. GHS-POP określa rozmieszczenie, nie zastępuje krajowej sumy z roku startowego.
4. Podział na grupy wieku pozostaje modelem krajowym. Siatka nie dostarcza regionalnych piramid wieku.

To przestrzenne szacunki oparte na danych ludnościowych i zabudowie, nie dokładne regionalne spisy z roku startowego. Rozdzielczość i uproszczone granice mapy mogą powodować odchylenia szczególnie w małych regionach i przy granicach państw.

## Zapis i awarie

- Rozpoczęte partie zachowują mieszkańców regionów, straty i migracje. Starszy zapis jest oznaczony jako rozkład powierzchniowy.
- Stary zapis z tury 0 może przyjąć nowy rozkład, bez zmiany ludności całego kraju.
- Awaria pobrania lub brak dodatnich wartości dla całego kraju włącza jawnie oznaczony szacunek powierzchniowy. Pojedyncze puste sektory w kraju z danymi nie otrzymują sztucznej ludności proporcjonalnej do powierzchni.
- Siatka jest dostarczana razem z grą. Przeglądarka nie pobiera danych z JRC ani nie potrzebuje konta do zewnętrznego serwisu.

## Odtworzenie pliku

Generator `scripts/generate-population-grid.py` wymaga Python, rasterio i numpy. Przyjmuje pobrane archiwum ZIP i docelową ścieżkę `public/population-2020-v1.bin`. Plik JSON obok zawiera sumę światową oraz skróty SHA-256 źródła i wygenerowanych danych. Przy zmianie zawartości należy zmienić wersję nazwy pliku również w `app/population-grid.ts`, aby pamięć podręczna nie zwracała starszej siatki.
