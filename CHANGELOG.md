# CHANGELOG

Wszystkie znaczące zmiany w projekcie są dokumentowane w tym pliku.
Format oparty na [Keep a Changelog](https://keepachangelog.com/pl-PL/1.0.0/).

## [0.3.0] - 2026-08-23

### Dodane
- automatyczna logistyka per region: dostęp morski, kolej, drogi, lotniska, rzeki
- karty decyzyjne inwestycyjne: budowa portu, modernizacja dróg/kolei, rozbudowa lotniska
- UI logistyki w panelu kraju: indeks krajowy i szczegóły regionów
- karty decyzyjne dostępne i użyteczne: wybór regionu, warunki dostępności, aktywne inwestycje
- konsumpcja napędzana przez wiek: primeAge/youth podnoszą gospodarkę, elderly/veryOld obniżają
- kultura i asymilacja: bliskość kulturowa wpływa na szybkość integracji okupowanych regionów
- uchodźcy wojenni: przepływ ludności z krajów atakowanych, efekty gospodarcze i stabilności
- clamp 0–100 dla wszystkich wskaźników na starcie, po zmianach i w UI
- poprawki baseline’ów: USA population 331→82, POL stability 62→53
- UI demografii w dokierze: słupki wiekowe, typ piramidy, populacja bezwzględna, granice
- style `.demographics-card`, `.demographics-bars`

### Zmienione
- `loadCapabilityStatesFromSnapshot()` przyjmuje `countries[]` i `entries[][]`
- `capabilityStateToSnapshotArray()` mapuje stany do `number[][]`
- `game-engine.ts` re-exportuje typy polityczne z `country-capability.ts`
- `getActivePlayerPolicyEffects()` zwraca efekty zgodne z `evaluateCapabilityChange()`
- dodano gettery demograficzne: `getCountryDemographics()`, `getCountryDemographicType()`, `getCountryPopulationAbsolute()`, `getCountryRefugeesHosted()`, `getCountryBorderPolicy()`, `getCountryCulturalProximity()`, `getCountryAssimilationProgress()`, `getDemographicLabel()`

## [0.2.0] - 2026-08-22

### Dodane
- deterministyczny model ewolucji zdolności państwowej bez losowych fluktuacji
- 6 wymiarów zdolności: gospodarka, populacja, technologia, logistyka, wojsko, stabilność
- dualny system stabilności: społeczna dla demokracji, reżimowa dla autorytaryzmów/totalitaryzmów
- modyfikator reżimu: demokracja -15%, autorytaryzm 0%, totalitaryzm +15%
- środowisko informacyjne jako zmienna złożona: 40% technologia, 30% kontrola mediów, 30% służby specjalne
- doświadczenie bojowe wagowane 25% w indeksie wojskowym, tylko konflikty przed 24.02.2022
- baselin 2021 dla 11 krajów scenariusza: POL, ROU, UKR, BLR, RUS, DEU, FRA, GBR, USA, TUR, PRK
- automatyczne baseline dla reszty krajów z seedami
- manewry/mobilizacja: manpower, koszty utrzymania, ukryta/jawna/pełna mobilizacja
- polityka imigracyjna jako akty polityczne: zamknięte, selektywne, otwarte, masowe
- system decyzji prezydenta: 2 PD/turę, karty akcji z kosztem i cooldownem
- UI: karty reżimu, środowiska informacyjnego, manewru, decyzji politycznych
- style `.regime-card`, `.information-card`, `.manpower-card`, `.policy-card`

### Zmienione
- zastąpiono losowe `noise`/`mix` w `evaluateCapabilityChange` na czysto deterministyczne wzory
- ulepszono obliczanie logistyki: obrażenia wojenne zależne od intensywności, technologii i odbudowy
- dodano karę za bazę obcą przy granicy: -8%/kwartał Ukraina, -5% Rosja, -3% Białoruś
- dodano bonus stabilności za terytorialne zyski: +5 przez 8 kwartałów, 50% zanik co 2 kwartały

### Naprawione
- usunięto błąd rosnącego z turą szumu, który podnosił wskaźniki do 100/100
- poprawiono kompresowane UI kart manewru i zmian potencjału
- poprawiono przypisanie `dataVersion` w `useMemo` dla `selectedDossier`

### Wydajność
- typecheck i testy 63/63 przechodzą
