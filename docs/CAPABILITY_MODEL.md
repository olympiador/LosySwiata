# Model zdolności państwowej — specyfikacja

Ten dokument opisuje aktualny model zdolności państwowej w grze Losy Świata. Jest źródłem prawdy dla obliczeń, UI i danych. Wszystkie nowe zmiany muszą być odzwierciedlone tutaj.

## 1. Cel modelu

Każde państwo ma profil 6 wymiarów w skali 0–100. Bez jednej fałszywie precyzyjnej liczby „siły”. Zmiany są czysto deterministyczne i mają przyczynę: kontekst tury, polityka gracza, okupacja, wydarzenia.

## 2. Wymiary

| Wymiar | Skala | Znaczenie |
|--------|-------|-----------|
| Gospodarka | 0–100 | potencjał produkcyjny, finanse, handel |
| Populacja | 0–100 | liczba, jakość, dynamika demograficzna |
| Technologia | 0–100 | innowacje, R&D, Cyber |
| Logistyka | 0–100 | infrastruktura, transport, odbudowa |
| Wojsko | 0–100 | personnel, sprzęt, doświadczenie bojowe |
| Stabilność | 0–100 | spójność społeczna lub reżimowa |

Dodatkowe bloki:
- Środowisko informacyjne: 0–100
- Doświadczenie bojowe: 0–25

## 3. Bazowanie i kalibracja

### Rok bazowy
Wszystkie dane bazowe pochodzą z 2021 roku, przed pełnoskalową wojną w Ukrainie.

### Ręczne baseline
Tylko dla krajów scenariusza 2021. Są one ręcznie kalibrowane, aby zachować realną intuicję strategiczną.

| Kraj | Typ reżimu | Gospodarka | Populacja | Technologia | Logistyka | Wojsko | Stabilność |
|------|-----------|------------|-----------|-------------|-----------|--------|------------|
| POL | demokracja | 65 | 60 | 68 | 72 | 55 | 53 |
| ROU | demokracja | 58 | 45 | 52 | 62 | 38 | 47 |
| UKR | demokracja | 38 | 55 | 48 | 50 | 48 | 32 |
| BLR | autorytaryzm | 35 | 32 | 45 | 55 | 42 | 42 |
| RUS | autorytaryzm | 65 | 85 | 62 | 58 | 88 | 65 |
| DEU | demokracja | 82 | 70 | 88 | 85 | 65 | 64 |
| FRA | demokracja | 78 | 68 | 82 | 80 | 62 | 55 |
| GBR | demokracja | 75 | 65 | 78 | 78 | 60 | 60 |
| USA | demokracja | 90 | 82 | 92 | 85 | 95 | 58 |
| TUR | autorytaryzm | 60 | 72 | 58 | 62 | 55 | 50 |
| PRK | totalitarny | 15 | 28 | 25 | 20 | 75 | 99 |

### Automatyczne baseline
Dla reszty krajów wartości są generowane automatycznie z seedami, bez ręcznej kalibracji.

## 4. Regime type i modyfikatory

### Typy reżimu
- `democracy`
- `authoritarian`
- `totalitarian`

### Modyfikator stabilności
- democracy: 0.85 (-15%)
- authoritarian: 1.0
- totalitarian: 1.1 (+10%)

## 5. Środowisko informacyjne

Składowe:
- techComponent: 40%
- mediaControl: 30%
- servicesStrength: 30%

Wynik: `score = techComponent * 0.4 + mediaControl * 0.3 + servicesStrength * 0.3`

Efekty na stabilność:
- democracy + score > 60: -10
- authoritarian + score > 70: +5
- totalitarian + score > 75: +8

## 6. Doświadczenie bojowe

- Bazowe wartości historyczne dla krajów z konfliktami przed 24.02.2022.
- Waga w indeksie wojskowym: 25%.
- Zmiany: +2 za wygraną kampanię, -1 za przegraną, +0.1/turę w trakcie wojny.
- Maximum: 25.

## 7. Manpower i mobilizacja

```
available = population * 0.22 * mobilizationMultiplier
active = min(military * 0.55, available)
reserves = max(0, available - active)
maintenanceCost = military * 0.08 + frontCount * 6 + mobilizationBonus
```

Stany mobilizacji:
- hidden: 1.0
- open: 1.1–1.25
- full: 1.35

## 8. Logistyka — model regionalny

Logistyka nie jest już jednym krajowym bonusem. Każdy region ma własny indeks 0–100, a wartość krajowa to średnia ważona regionów. Indeks wpływa na gospodarkę, manpower i kampanie wojenne.

### 8.1 Składowe regionalne (heurystyka z danych mapy)
- dostęp morski: 30%
- gęstość sieci kolejowej: 25%
- gęstość dróg: 25%
- lotniska: 15%
- rzeki: 5%

Heurystyka obliczana w `computeRegionLogisticsFromMap()`:
- `maritimeAccess`: 70 jeśli region ma wybrzeże, inaczej 0
- `railDensity`: 0.7 dla dużych regionów (>20 000 km²), 0.35 dla reszty
- `roadDensity`: 0.5 bazowo
- `airportCount`: 1 jeśli region ma stolicę, inaczej 0
- `riverAccess`: 0

### 8.2 Karty decyzyjne inwestycyjne
Gracz może inwestować w infrastrukturę za punkty decyzyjne:
- Budowa portu: +20 logistyki, koszt 2 PD, 8 kwartałów
- Modernizacja dróg: +10 logistyki, koszt 1 PD, 4 kwartały
- Rozbudowa lotniska: +12 logistyki, koszt 1 PD, 6 kwartałów
- Modernizacja kolei: +15 logistyki, koszt 1 PD, 6 kwartałów

### 8.3 Wpływ na inne wskaźniki
- logistyka <30 → gospodarka -0.05/tk
- logistyka >80 → gospodarka +0.03/tk
- logistyka <40 → manpower -0.02/tk

## 9. Gospodarka — deterministyczny model

```
delta = (baseline - current) * 0.05
  + (hasIncoming ? -0.15 : 0.04)
  - activeOccupations * 0.08
  + (hasOutgoing ? -0.02 : 0)
clamp(delta, -0.5, 0.5)
```

## 10. Populacja — przejście demograficzne

```
baseGrowth = 0.005  # 0.5% rocznie
technologyImpact = clamp(technology / 100 * 0.012, 0, 0.01)  # max -1%
immigrationDelta = f(policy, neighbours, formerColonies)
delta = components.population * (baseGrowth - technologyImpact + immigrationDelta) / 4
```

## 11. Wojsko

```
delta = (baseline - current) * 0.06
  + (hasOutgoing ? 0.3 : -0.05)
  + (hasIncoming ? 0.1 : 0)
  + combatExperienceGain * 0.1
clamp(delta, -0.4, 0.5)
```

## 12. Technologia

```
delta = (baseline - current) * 0.03
  + (hasOutgoing ? -0.08 : 0.03)
  - sanctionsPenalty * 0.05
clamp(delta, -0.3, 0.3)
```

## 13. Stabilność — pełna formuła

```
stabilityComposite = current + delta_base
delta_base = (baseline - current) * 0.03
  + (hasIncoming ? -0.3 : 0.05)
  + occupationLoad * 0.5

infoEffect = informationEnvironmentEffect(regimeType, infoEnv.score)
foreignBasePenalty = clamp(foreignBasePressure * 5, 0, 10)

stabilityFinal = clamp(
  (stabilityComposite + infoEffect + foreignBasePenalty)
  * regimeModifier(regimeType),
  0,
  100
)
```

## 14. Imigracja — akty polityczne

### Poziomy
| Poziom | Nazwa | Imigracja/tk | Efekt na stabilność |
|--------|-------|--------------|---------------------|
| 0 | Zamknięte granice | 0 | +2/tk (demokracja: -2/tk) |
| 1 | Selektywna | +0.05%/tk | -1/tk |
| 2 | Otwarte | +0.15%/tk | -3/tk |
| 3 | Masowa (byłe kolonie/sąsiedzi) | +0.3%/tk | -6/tk |

### Źródła imigracji
- Kraje o `population` > 50 i `technology` < 40 (słabsze sąsiedzi)
- Byłe kolonie: manualna lista per kraj
- Regiony z `stability` < 30 i `hasIncoming = true` (uchodźcy z wojny)

### Protesty
Jeśli `stability < 40` i `immigration > 0.1%/tk`:
- Co 3 kwartały: -2 stabilności, -1 gospodarka
- Jeśli `stability < 30`: protesty co turę

## 15. Demografia

### Skalowanie populacji
- Względem światowej populacji 2021: 7.8 mld.
- 100 pkt populacji ≈ 100 mln osób.

### Grupy wiekowe
- children 0–14
- youth 15–24
- primeAge 25–44
- middleAge 45–64
- elderly 65+
- veryOld 80+

### Typy piramid według Zeihana
- healthy: children + youth > 0.35
- chimney: 0.25–0.35
- inverted: < 0.25

### Konsumpcja napędzana przez wiek
- consumptionDrive = primeAge*0.6 + youth*0.4 - elderly*0.3 - veryOld*0.5
- Wpływa na gospodarkę jako bonus/kara.

### Klif demograficzny
- Jeśli elderly + veryOld > 0.35 i children < 0.15:
  - -0.06/tk gospodarki
  - -0.02/tk stabilności
  - -0.03/tk manpower

### Bliskość kulturowa i asymilacja
- Skala 0–1, wartości ręczne dla 11 krajów scenariusza.
- assimilationRate = 0.015 + culturalProximity*0.03 + regimeBonus (totalitarian +0.01)
- Czas asymilacji: 26–59 kwartałów według bliskości.

### Uchodźcy wojenni
- Max 30% populacji z stref wojny.
- Podział: 70% workingAge, 20% dzieci, 10% elderly.
- Polityka graniczna modyfikuje przepływy.

### Granice
- closed / selective / open / mass

## 16. Akty polityczne gracza

### Mechanika
- Gracz ma 2 punkty decyzyjne/turę (PD)
- Każdy akt kosztuje 1–2 PD
- Akty mają efekt natychmiastowy, koszt utrzymania i cooldown
- Niektóre akty wymagają warunków

### Przykładowe akty

#### Ustawa o nadzorze mediów
- Koszt: 1 PD
- Efekt: +15 mediaControl przez 8 tur
- Koszt utrzymania: -3 stabilności/kwartał (demokracja), 0 (autorytaryzm)
- Cooldown: 12 tur
- Warunek: informationEnvironment.mediaControl < 60

#### Program inwestycji w R&D
- Koszt: 2 PD
- Efekt: +3 technologii przez 6 tur
- Koszt utrzymania: -4 gospodarki/kwartał przez 6 tur
- Cooldown: 10 tur
- Warunek: economy > 50

#### Pełna mobilizacja
- Koszt: 1 PD
- Efekt: manpower.mobilization = "full" przez 12 tur
- Koszt utrzymania: -8 stabilności/kwartał, -3 gospodarki/kwartał
- Cooldown: 20 tur
- Warunek: hasIncoming lub hasOutgoing

#### Otwarte granice
- Koszt: 1 PD
- Efekt: immigrationPolicy = "open" przez 10 tur
- Koszt utrzymania: -3 stabilności/kwartał (jeśli tech > 60)
- Cooldown: 14 tur
- Warunek: technology > 40

#### Zamknięcie granic
- Koszt: 1 PD
- Efekt: immigrationPolicy = "closed" przez 8 tur
- Koszt utrzymania: +2 stabilności (autorytaryzm), -2 stabilności (demokracja)
- Cooldown: 10 tur

#### Ofensywa propagandowa
- Koszt: 2 PD
- Efekt: +8 informationEnvironment.score przez 5 tur
- Koszt utrzymania: -5 gospodarki/kwartał
- Cooldown: 16 tur
- Warunek: mediaControl > 30 lub servicesStrength > 30

#### Dyplomatyczna presja na NATO
- Koszt: 2 PD
- Efekt: foreignBasePressure - 0.3 dla sąsiadów z bazami przez 6 tur
- Koszt utrzymania: -3 gospodarki/kwartał
- Cooldown: 20 tur
- Warunek: sąsiedzi z bazami obcymi

## 17. UI — sekcje dokieru

- `manpower-card`: dysponujący, aktywni, rezerwy, koszt utrzymania, mobilizacja
- `regime-card`: typ reżimu, doświadczenie bojowe
- `information-card`: technologia, kontrola mediów, służby specjalne
- `demographics-card`: grupy wiekowe, typ piramidy, populacja bezwzględna, polityka graniczna
- `policy-card`: punkty decyzyjne, lista dostępnych aktów, przyciski wykonania

## 18. Weryfikacja

- typecheck: `npm run typecheck`
- testy: `npm test` — obecnie 63/63
- build: `npm run build`

## 18. Źródła danych

- World Bank Governance Indicators 2021
- Freedom House 2021
- Transparency International CPI 2021
- SIPRI 2021
- WIPO Global Innovation Index 2021
- IISS Military Balance 2021
- World Bank World Development Indicators 2021

Wszystkie dane są z przed 24.02.2022 i mogą być zweryfikowane przez użytkownika.
