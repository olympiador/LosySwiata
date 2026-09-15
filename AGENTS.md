# Losy Świata — zasady utrzymania

To repozytorium jest kanonicznym źródłem kodu gry.

## Stały workflow

- Przed zmianą sprawdź stan Git i nie nadpisuj cudzej niezacommitowanej pracy.
- Po każdej spójnej zmianie uruchom `npm test`.
- Zieloną zmianę commituj na `main` i wypychaj do `origin` (`olympiador/LosySwiata`).
- Tę samą pełną rewizję `HEAD` publikuj w istniejącym ChatGPT Sites, korzystając z `project_id` zapisanego w `.openai/hosting.json`.
- Nie uznawaj pracy za zakończoną, jeśli GitHub i wdrożona wersja Sites wskazują różne commity.

## Komputer HP

- Kopia robocza na `HP-MALY` ma ścieżkę `/home/user/losy-swiata` i ten sam `origin`.
- Aktualizuj ją przez Git (`git pull --ff-only`); nie edytuj równocześnie tej samej gałęzi na dwóch komputerach.
- Kod i dokumentacja mogą być synchronizowane. Sekrety, pliki uwierzytelniające, lokalne cache i zależności nie trafiają do Git ani nie są kopiowane między komputerami.

## Dane gry

- Zapisy rozgrywki w `localStorage` należą do konkretnej przeglądarki i urządzenia; Git ich nie synchronizuje.
