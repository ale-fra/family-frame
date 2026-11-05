# Family Frame

A local-first digital family frame built with React, TypeScript and a local Node.js server.
It shows a photo slideshow, Open-Meteo weather, and events from one or more iCalendar feeds.
A phone-oriented `/admin` page manages photos, calendars, important keywords and special days.

## Run

Requires Node.js 24 or later and npm. No monitor driver, Linux desktop or systemd is needed.

```bash
npm ci
npm run build
npm run server
```

Open `http://127.0.0.1:8787` for the frame, `http://127.0.0.1:8787/admin` for photo admin and
`http://127.0.0.1:8787/api/docs` to try the timers and routines API.
For development, run `npm run server` and `npm run dev` in separate terminals, then open
`http://127.0.0.1:5173`. Vite proxies API requests, including `/api/docs`, to the local server.

```bash
npm test
npm run build
```

## Tests

Tests live in one folder per type; each folder is a Vitest project (`vitest.config.ts`).

| Command | Folder | What it covers | Time |
|---|---|---|---|
| `npm run test:unit` | `test/unit/` | Pure logic, no I/O: validation, recurrence, display rules, OpenAPI document checks | ~4 s |
| `npm run test:integration` | `test/integration/` | Real SQLite databases and local services: stores, notifier, webhook delivery | ~3 s |
| `npm run test:api` | `test/api/` | HTTP through the Express app: endpoints, authentication, Swagger, OpenAPI contract | ~6 s |
| `npm run test:ui` | `test/ui/` | React components in jsdom: the frame's timers and routines, the admin Routines section | ~9 s |
| `npm run test:e2e` | `test/e2e/` | Real `node` processes: server startup, token and timer command lines, both server entry points | ~5 s |
| `npm run test:fast` | unit + integration | The quick loop while coding | ~6 s |
| `npm test` | all | Everything, before committing | ~15 s |

Narrow further with Vitest arguments after `--`:

```bash
npm test -- test/unit/clockSync.test.ts     # one file
npm run test:api -- schedule-api            # files whose path contains "schedule-api", in one type
npm test -- -t "formatRemaining"            # tests whose name matches
npm run test:watch                          # unit + integration, re-run on save
```

A test file outside these folders would never run; `test/unit/test-layout.test.mjs` fails if one exists.
Shared helpers live in `test/helpers/`.

## Photos and settings

The server stores photos, metadata, logs and SQLite settings under `data/`, which is ignored by Git.
JPEG, PNG, WebP and GIF uploads start as pending; only approved photos enter the slideshow.
The static `public/photos/manifest.json` is a fallback when the server is unavailable.
Use synthetic photos and calendars when sharing a copy of the project.

`public/frame.config.json` is the browser configuration. Keep the root `frame.config.json` helper
copy in sync. Server-side settings from `/admin` override these defaults.
`FRAME_CONFIG_FILE` can point to a private configuration file served by the production server;
Vite development mode continues to use `public/frame.config.json`.

Weather uses Open-Meteo and requires an internet connection. Set `weather.city` to resolve a city,
or clear it and set coordinates manually. Calendar sources can be configured in `/admin`, through
`FRAME_CALENDAR_ICS_URL`, or by pointing `FRAME_CALENDAR_SOURCES_FILE` to a local JSON file.
Private feed URLs stay on the server; public APIs expose proxy URLs.
For a static demo, set `calendar.icsUrl` to `/calendar/family.ics` and `calendar.sourcesUrl` to `""`.

Copy `.env.example` to `.env` for local overrides. All values in the example are placeholders.
`FRAME_ADMIN_PIN` protects the admin endpoints (see below). `FRAME_LOCALE` (`it-IT` by default, or e.g. `en-GB`, `en`)
selects the language and date format; it is exposed read-only as `i18n` in `/api/settings`.
Optional Telegram ingestion uses
`FRAME_TELEGRAM_BOT_TOKEN` and `FRAME_TELEGRAM_ALLOWED_CHAT_IDS`; received photos still need approval.

### Admin authentication

With `FRAME_ADMIN_PIN` set, every `/api/admin/*` request needs one of:

- `X-Frame-Admin-Pin: <PIN>`: used by the `/admin` page.
- `Authorization: Bearer <token>`: for integrations such as Home Assistant or scripts.
- `Authorization: Basic …` with the token as the password (any user name), for tools that only support Basic.

Tokens are created on the device, in the app directory, and take effect immediately:

```bash
npm run token -- create home-assistant                  # prints the token once; only a hash is stored
npm run token -- create backup-script --scope admin
npm run token -- list                                   # names, scopes, creation and last-use dates
npm run token -- revoke home-assistant
```

A token's scope limits what it can do. `schedule` (the default) covers timers and routines only; `admin` covers
everything the PIN can do, including photos, settings and the private calendar URLs stored in them. Give
third-party systems `schedule` tokens. A valid token used beyond its scope gets HTTP 403 (`insufficient-scope`).
Tokens created before scopes existed keep `admin`. Ten wrong attempts within 15 minutes block that device until the window
ends (HTTP 429 with `Retry-After`), even with the right PIN. The server logs a warning for a missing PIN or one
shorter than 6 characters. Browsers never send these credentials by themselves (the 401 challenge is `Bearer`,
never `Basic`, so there is no browser password prompt), so other websites cannot use them.

Without a PIN the admin API is open, tokens included: any device on the local network can manage photos,
settings, timers and routines, and a web page open in a browser on that network could trigger some admin
actions. Set a PIN unless every device on the network is trusted. Credentials travel over plain HTTP, which
suits a home LAN but not the internet; use an HTTPS reverse proxy if the network is not trusted.

## Timers and routines

**On the frame.** While a timer or routine is on, it takes over the whole photo area (the slideshow and special-day
effects pause underneath and resume where they left off). Up to 3 items are shown, ringing first, then the soonest,
paused last; a badge counts the others. Each item is drawn in its `style`: `disc` (a shrinking slice), `sweets`
(one block per minute, or per 10 seconds for short timers), `journey` (a snail walking to the icon) or `clock` (real
hands and a zone up to the time). Minutes are rounded up; the last minute counts seconds. A finished timer or a due
routine turns coral and pulses for its ring window, then the photos come back. The frame learns about changes
through the `/api/events` stream, follows the server's clock and formats times with `FRAME_LOCALE` and
`FRAME_TIMEZONE`; its texts are in Italian or English.

**Routines in `/admin`.** The Routines section lists routines in plain words ("Monday to Friday at 08:10"), with
their status and next time. Create or edit them with presets for the days, a live summary, previews of the four
styles and an icon picker; pause (optionally until a date), resume, cancel, and skip or restore single occurrences.
Timers are managed through the API only.

**Quick test from the command line.** Start the server first, then run the command in a second terminal, in the same
folder (it reads the same `.env`):

```bash
npm run build && npm run server                           # terminal 1 (open http://127.0.0.1:8787)
npm run add-3-min-timer                                   # terminal 2: "Test timer", 3 minutes
npm run timer -- 10m "Pasta is ready" --style sweets --icon pot
```

The command shows the time left on one updating line and ends when the timer rings; Ctrl+C cancels the timer on the
frame. With `FRAME_ADMIN_PIN` set it creates a temporary `schedule` token in the server's database (`data/`, or
`FRAME_DATA_DIR`) and revokes it when it ends; without a PIN the API is open and no token is needed.
`FRAME_API_URL` points it at another server address.

### API

Try it at `/api/docs`: enter the admin PIN if configured, then use **Execute** in Swagger UI. The full reference,
including recurrence rules, display styles, the public `GET /api/schedule`, schedule events and the webhook, is in
[`docs/api.md`](docs/api.md).

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Pasta is ready","durationMs":600000}' http://127.0.0.1:8787/api/admin/timers
```

## Architecture

- `src/frame/`: display components, slideshow, weather and calendar hooks.
- `src/admin/`: photo and settings management.
- `server/`: local API, photo processing, calendar proxy and settings storage.
- `server/lib/schedule-*.mjs`: one-off timers and routine appointments stored in the settings SQLite
  database (`timers`, `routines`, `routine_exceptions`, versioned in `schema_migrations`):
  `schedule-schema.mjs` (migrations), `schedule-store.mjs` (shared database and public schedule),
  `schedule-timer-store.mjs` (timer transitions), `schedule-routine-store.mjs` (routines and their occurrences),
  `schedule-utils.mjs` (validation, time zones, recurrence) and `schedule-routes.mjs` (REST routes).
- `server/lib/schedule-events.mjs`, `schedule-notifier.mjs` and `schedule-webhook.mjs`: the schedule event hub,
  time-based events and webhook delivery.
- `src/frame/components/ScheduleStage.tsx` and `ScheduleVisuals.tsx`, `src/frame/hooks/useSchedule.ts`: the timers
  and routines on the frame. `src/frame/lib/scheduleDisplay.ts`, `scheduleIcons.ts`, `clockSync.ts` and `i18n.ts`:
  their display rules, icon map, server clock estimate and texts.
- `src/admin/routines/`: the Routines section of `/admin` (component, API client, texts, form helpers).
- `server/timer-cli.mjs`: `npm run timer` / `npm run add-3-min-timer`.
- `server/lib/admin-auth.mjs`, `server/lib/api-tokens.mjs` and `server/token-cli.mjs`: admin authentication
  (PIN, API tokens, failed-attempt limit) and the token command line.
- `server/lib/migrations.mjs`: append-only SQLite migrations, tracked per scope in `schema_migrations`.
- `server/lib/openapi.mjs` and `server/lib/api-docs.mjs`: OpenAPI document and Swagger UI.
- `docs/api.md`: timers and routines API reference. `docs/mockups/`: design proposals for the timers and
  routines UI, built from the real frame display code (`node docs/mockups/build.mjs`).
- `tools/generate-api-types.mjs`: generates `src/lib/api-schema.ts` from the OpenAPI document.
- `server/lib/database.mjs`: opens `settings.sqlite` once; the settings, schedule and token stores share it.
- `server/lib/system-actions.mjs`: portable device-operation interface. Its default implementation
  reports unavailable operations; it never launches host commands.
- `examples/`: curated synthetic assets used to prepare shareable copies.
- `test/`: tests by type (`unit/`, `integration/`, `api/`, `e2e/`, see Tests), using temporary storage.
  `test/helpers/openapi-contract.mjs` checks every request and response in the schedule API tests against the
  OpenAPI document.

`startFrameServer({ createActions, onScheduleEvent })` in `server/frame-server.mjs` allows a deployment to inject
device operations and react to schedule events.

`server/photo-server.mjs` still starts the same server and exports `startPhotoServer()` for existing device launchers.
`FRAME_SERVER_PORT` takes precedence if both it and the older `FRAME_PHOTO_SERVER_PORT` are set.
`GET /api/admin/capabilities` reports availability. The portable server returns HTTP 501 for display
power, night scheduling and deployment refresh; the admin hides the monitor controls.
Photo, calendar and slideshow functions remain available.

The separate `family-frame-device` repository owns Ubuntu/X11, DisplayLink, kiosk launch,
night timers, systemd installation and Git-based device updates. Installations that used the former
`scripts/` and `systemd/` files must migrate their services using that repository's guide.
The app keeps a bright outer frame and uncropped photos for readability on older displays.

## License

MIT. See `LICENSE`.
