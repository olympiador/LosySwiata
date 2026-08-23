# Losy Świata

Strategiczna gra przeglądarkowa o państwach, granicach i długofalowych konsekwencjach wojen. Aktualna wersja działa pod adresem: https://losy-swiata.shaughnessy.chatgpt.site

Najważniejszy dokument projektowy: [docs/ROADMAP_STRATEGICZNA.md](docs/ROADMAP_STRATEGICZNA.md).

## Model zdolności państwowej

Państwo nie ma jednej liczby „siły”. Ma profil 6 wymiarów ocenianych w skali 0–100:

- gospodarka
- populacja
- technologia
- logistyka
- wojsko
- stabilność

Dodatkowo liczone są środowisko informacyjne i doświadczenie bojowe.
Wszystkie zmiany są deterministyczne: każda wartość zmienia się tylko z przyczyny, np. wojna, polityka gracza, okupacja, kontekst tury.

### Stabilność
- Demokracje: społeczna stabilność = 50% WGI 2021 + 25% Freedom House 2021 + 25% CPI 2021.
- Autorytaryzmy/totalitaryzmy: stabilność reżimowa = 40% represje + 30% brak opozycji + 30% kontrola mediów.
- Modyfikator reżimu: demokracja -15%, autorytaryzm 0%, totalitaryzm +15%.
- Środowisko informacyjne modyfikuje stabilność: -10 dla demokracji z score >60, +5/+8 dla autorytaryzmów/totalitaryzmów z score >70/75.
- Obce bazy przy granicy: -8%/kwartał Ukraina, -5% Rosja, -3% Białoruś.
- Terytorialne zyski: +5 stabilności przez 8 kwartałów, 50% zanik co 2 kwartały po wygaśnięciu.

### Logistyka
- Obrażenia zależne od intensywności wojny, technologii i wielkości terytorium.
- Odbudowa zależna od gospodarki i logistyki.
- Okupacje obciążają logistykę o 10% każda.

### Populacja i technologia
- Wyższa technologia zmniejsza przyrost naturalny: model przejścia demograficznego.
- Polityka imigracyjna może compensować spadek: 4 poziomy od zamkniętych granic do masowej imigracji.

### Demografia
- Model Zeihana: 6 grup wiekowych.
- Typy piramid: zdrowa, kominek, odwrócona.
- Konsumpcja napędzana przez wiek: primeAge/youth podnoszą gospodarkę, elderly/veryOld obniżają.
- Bliskość kulturowa wpływa na asymilację zdobyczy.
- Uchodźcy wojenni zmieniają strukturę wiekową kraju atakowanego i przyjmującego.

### Manpower i mobilizacja
- 3 stany: ukryta, jawna, pełna.
- Koszt utrzymania zależny od wielkości armii i frontów.
- Gracz decyduje o mobilizacji jako akcie politycznym.

### Akty polityczne
- Gracz ma 2 punkty decyzyjne na turę.
- Akty to karty z efektem, kosztem utrzymania, cooldownem i warunkami.
- Przykłady: nadzór mediów, program R&D, pełna mobilizacja, otwarte/zamknięte granice, ofensywa propagandowa, presja dyplomatyczna.
- Nie ma suwaków: każda decyzja to jednorazowy akt z konsekwencjami.

## Uruchomienie lokalne
- Dane bazowe z 2021 roku, przed pełnoskalową wojną w Ukrainie.
- Ręczna kalibracja dla 11 krajów scenariusza, reszta z automatycznych wskaźników z seedów.
- Wszystkie źródła są weryfikowalne: World Bank, SIPRI, WIPO GII, Freedom House, Transparency International, IISS.

## Uruchomienie lokalne

Wymagany jest Node.js 22.13 lub nowszy.

```bash
npm install
npm run dev
```

Testy i pełna walidacja projektu:

```bash
npm test
```

Poniżej znajdują się techniczne informacje o środowisku projektu.

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout and then validates the Sites artifact. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build, validate, and verify the rendered development-preview metadata
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
