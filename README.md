# Family Frame

A local-first digital family frame built with React, TypeScript and a local Node.js photo service.
It shows a photo slideshow, Open-Meteo weather, and events from one or more iCalendar feeds.
A phone-oriented `/admin` page manages photos, calendars, important keywords and special days.

## Run

Requires Node.js 24 or later and npm. No monitor driver, Linux desktop or systemd is needed.

```bash
npm ci
npm run build
npm run server
```

Open `http://127.0.0.1:8787` for the frame and `http://127.0.0.1:8787/admin` for photo admin.
For development, run `npm run server` and `npm run dev` in separate terminals, then open
`http://127.0.0.1:5173`. Vite proxies API requests to the local server.

```bash
npm test
npm run build
```

## Photos and settings

The server stores photos, metadata, logs and SQLite settings under `data/`, which is ignored by Git.
JPEG, PNG, WebP and GIF uploads start as pending; only approved photos enter the slideshow.
The static `public/photos/manifest.json` is a fallback when the photo service is unavailable.
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
An optional `FRAME_ADMIN_PIN` protects admin endpoints. Optional Telegram ingestion uses
`FRAME_TELEGRAM_BOT_TOKEN` and `FRAME_TELEGRAM_ALLOWED_CHAT_IDS`; received photos still need approval.

## Architecture

- `src/frame/`: display components, slideshow, weather and calendar hooks.
- `src/admin/`: photo and settings management.
- `server/`: local API, photo processing, calendar proxy and settings storage.
- `server/lib/system-actions.mjs`: portable device-operation interface. Its default implementation
  reports unavailable operations; it never launches host commands.
- `examples/`: curated synthetic assets used to prepare shareable copies.
- `test/`: unit and API tests, using temporary storage.

`startPhotoServer({ createActions })` allows a deployment to inject device operations.
`GET /api/admin/capabilities` reports availability. The portable server returns HTTP 501 for display
power, night scheduling and deployment refresh; the admin hides the monitor controls.
Photo, calendar and slideshow functions remain available.

The separate `family-frame-device` repository owns Ubuntu/X11, DisplayLink, kiosk launch,
night timers, systemd installation and Git-based device updates. Installations that used the former
`scripts/` and `systemd/` files must migrate their services using that repository's guide.
The app keeps a bright outer frame and uncropped photos for readability on older displays.

## License

MIT. See `LICENSE`.
