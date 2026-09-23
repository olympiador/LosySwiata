# Losy Świata — zasady utrzymania

To repozytorium jest kanonicznym źródłem kodu gry.

## Stały workflow

- Przed zmianą sprawdź stan Git i nie nadpisuj cudzej niezacommitowanej pracy.
- Przy każdej pracy wymagającej kodowania w tej grze Codex jest zlecającym: przekazuje zadanie Gemini działającemu na `HP-MALY`. Gemini wykonuje zmiany w kodzie i testach na HP.
- Codex odbiera wynik, przegląda diff, sprawdza działanie i testy. Jeśli są błędy lub braki, odsyła konkretne poprawki do Gemini na HP i ponownie weryfikuje wynik. Nie zastępuje Gemini własnym kodowaniem bez nowej, wyraźnej dyspozycji użytkownika.
- Gdy Gemini na HP jest niedostępne, zgłoś przeszkodę użytkownikowi; nie przechodź po cichu na lokalne kodowanie.
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
