# Agent Guide: Family Frame

## Project Goal

Turn an old ASUS MB169B+ USB DisplayLink monitor into a digital family frame. The frame runs on the repurposed Ubuntu laptop and shows:

- Family photos from a local folder.
- Current weather and short forecast.
- Important events from an `.ics` calendar source.

The device is meant to be always-on, low-touch, and readable from a distance.

## Current Hardware State

- Host: Dell Latitude laptop, Ubuntu 24.04.x, X11/LXQt session.
- Display: ASUS MB169B+ / MB168B+ class USB DisplayLink monitor.
- External output after DisplayLink driver install: `DVI-I-1-1`.
- Current layout: laptop panel `eDP-1` at `1920x1080+0+0`, frame monitor at `1920x1080+1920+0`.
- Target orientation: landscape, 1920x1080.

Important hardware constraint: the monitor is old and has visible bright edge bleed on dark backgrounds. Keep the UI bright at the outer edges. Avoid black or very dark full-screen backgrounds, dark sidebars, and dark letterboxing.

## Architecture

This is a local-first Vite + React + TypeScript app with a small local Node photo service.

- `src/main.tsx` owns app state, config loading, data fetching, slideshow rotation, weather fetch, and `.ics` parsing.
- `/admin` in `src/main.tsx` is the phone-oriented photo admin UI.
- `src/styles.css` owns the full screen visual layout. The current theme intentionally uses a light digital passepartout to hide the monitor's edge bleed.
- `server/photo-server.mjs` owns dynamic photo upload, metadata, approved-photo API, and optional Telegram ingestion.
- `data/` stores uploaded photos and `photos.json`; it is local runtime state and is ignored by git.
- `public/frame.config.json` is the runtime config actually served by Vite.
- `frame.config.json` mirrors the runtime config at repo root for easy discovery/editing.
- `public/photos/manifest.json` lists local photo files.
- `public/calendar/family.ics` is the default local calendar file.
- `scripts/setup-display.sh` configures the external monitor with `xrandr`.
- `scripts/start-kiosk.sh` starts the photo/app server if needed and launches Chromium in kiosk mode on the external monitor.
- `scripts/update-and-build.sh` runs safe `git pull --ff-only`, dependency install when needed, and build.
- `scripts/remote-refresh.sh` is called by admin/Telegram refresh hooks and restarts systemd services when installed.
- `systemd/user/` contains user-service templates for server, kiosk, and periodic updates.
- `scripts/install-displaylink-ubuntu.sh` installs the Synaptics DisplayLink APT repo and `displaylink-driver`.

The browser fetches static local assets, dynamic approved photos from the local photo service, and Open-Meteo directly.
If the photo service is unavailable, the app falls back to the static photo manifest.

## Runtime Flow

1. `npm run display`
   - Runs `scripts/setup-display.sh`.
   - Finds the first connected output that is not `FRAME_PRIMARY_OUTPUT` / `eDP-1`.
   - Sets it to `1920x1080`, landscape, positioned right of the laptop screen.

2. `npm run kiosk`
   - Runs `scripts/start-kiosk.sh`.
   - Starts `server/photo-server.mjs` if needed.
   - Reads `xrandr` geometry.
   - Launches Chromium with `--window-position` and `--window-size` matching the external monitor.
   - Uses a snap-friendly Chromium profile under `~/snap/chromium/common/family-frame-profile` when `/snap/bin/chromium` is detected.

3. The React app loads:
   - `/frame.config.json`.
   - Approved photos from `/api/photos?status=approved`, falling back to `photoManifestUrl`.
   - Weather from Open-Meteo.
   - Calendar events from `calendar.icsUrl`.

4. Photo admin:
   - `/admin` can upload JPEG, PNG, WebP, and GIF files from a phone on the LAN.
   - Uploaded web and Telegram photos enter `pending`.
   - Only `approved` photos appear in the slideshow.
   - `hidden` and `trashed` photos remain in local metadata but are not shown.
   - `POST /api/admin/refresh` and Telegram `/refresh` trigger safe pull/build/restart.

## Configuration

Edit `public/frame.config.json` for runtime behavior:

- `frameName`: empty-state title.
- `photoManifestUrl`: static JSON photo manifest URL.
- `weather.latitude`, `weather.longitude`, `weather.timezone`, `weather.label`: Open-Meteo location.
- `weather.city`: city name resolved through Open-Meteo geocoding; when set, it overrides manual coordinates.
- `weather.showLocationLabel`: whether to show the weather location name on the frame.
- `weather.refreshMinutes`: browser refresh interval.
- `calendar.icsUrl`: local or remote `.ics` URL.
- `calendar.lookaheadDays`: upcoming event window.
- `calendar.importantKeywords`: title keywords used to visually emphasize events.
- `slideshow.intervalSeconds`: photo rotation interval.

If changing config defaults in code, keep `public/frame.config.json` and root `frame.config.json` in sync unless intentionally removing the root helper copy.

## Visual Design Rules

Preserve these unless the hardware changes:

- Keep all viewport edges light or medium-light.
- Avoid pure black near monitor edges.
- Keep photo area inside a light frame/passepartout.
- Prefer `object-fit: contain` for photos so family pictures are not cropped unexpectedly.
- Avoid dark translucent overlays; use warm light overlays for captions and panels.
- Use stable dimensions: the frame is primarily for 1920x1080 landscape.

The current CSS intentionally prioritizes hiding LCD edge bleed over high-contrast dark dashboard aesthetics.

## Operational Commands

```bash
npm install
npm run server
npm run update
npm run build
npm run dev
npm run display
npm run kiosk
```

Useful overrides:

```bash
FRAME_PRIMARY_OUTPUT=eDP-1 FRAME_DISPLAY_OUTPUT=DVI-I-1-1 npm run display
FRAME_PRIMARY_OUTPUT=eDP-1 FRAME_DISPLAY_OUTPUT=DVI-I-1-1 npm run kiosk
FRAME_CHROMIUM_BIN=chromium npm run kiosk
FRAME_CHROMIUM_PROFILE=~/snap/chromium/common/family-frame-profile npm run kiosk
FRAME_APP_URL=http://127.0.0.1:5173 npm run kiosk
FRAME_ADMIN_PIN=1234 npm run server
FRAME_TELEGRAM_BOT_TOKEN=123456:token FRAME_TELEGRAM_ALLOWED_CHAT_IDS=123456789 npm run server
bash scripts/install-autostart.sh
```

Autostart uses systemd user services. `loginctl show-user "$USER" -p Linger` currently reports
`Linger=no`; for unattended boot, prefer graphical autologin for the frame user, and optionally run
`sudo loginctl enable-linger alessandro` if services must start before manual login.

## Known Warnings

Snap Chromium can print AppArmor, GTK, DBus, IBUS, and update mount namespace warnings. These are noisy but usually non-fatal if Chromium opens and displays the app.

If Chromium fails with `SingletonLock: Permission denied`, make sure the profile path is under:

```bash
~/snap/chromium/common/family-frame-profile
```

## Testing Expectations

Before handing changes back:

- Run `npm run build`.
- If changing display or kiosk scripts, run `bash -n scripts/*.sh`.
- If connected to the frame monitor, run `npm run display` and verify `xrandr` reports the external output at `1920x1080+1920+0`.
- Visually check the frame on the actual ASUS monitor when changing CSS; dark desktop/browser backgrounds can expose edge bleed.

## Safe Extension Points

Good next changes:

- Add a small local script to regenerate `public/photos/manifest.json` from image files.
- Add Google Calendar OAuth or a private calendar sync job, keeping `.ics` as the simplest fallback.
- Add a systemd user service for autostart after login.
- Add offline caching for last successful weather/calendar payloads.
- Add a settings page or local admin route for config edits.

Avoid large rewrites until the hardware/kiosk loop is stable. The most valuable invariant is: boot/login should lead to the correct display showing the frame without manual window dragging.
