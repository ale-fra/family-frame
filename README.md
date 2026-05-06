# Family Frame

A local-first digital frame for the ASUS MB169B+ DisplayLink monitor. The app shows a family photo slideshow, current weather, short forecast, and important calendar events.

For future coding agents and maintainers, read `AGENTS.md` first. It documents the hardware assumptions, kiosk flow, architecture, and visual constraints for this specific monitor.

## Current Target

- Host: current Ubuntu 24.04 laptop
- Display: ASUS MB169B+ USB DisplayLink monitor
- Orientation: landscape, 1920x1080
- Content: local photo manifest, Open-Meteo weather, local or URL `.ics` calendar

## Run The App

```bash
npm install
npm run server
npm run dev
```

Open `http://127.0.0.1:5173` for the frame and `http://127.0.0.1:5173/admin` for photo admin.
From a phone on the same Wi-Fi, use the laptop's LAN IP with port `5173`, for example
`http://192.168.1.20:5173/admin`.

For the production-style local runtime, build once and run the single server:

```bash
npm run build
npm run server
```

Then open `http://127.0.0.1:8787` for the frame and `http://127.0.0.1:8787/admin`
from the phone. The kiosk script uses this `8787` runtime by default.

## Add Photos From A Phone

The dynamic photo library is stored under `data/`, which is intentionally ignored by git.
The admin page can upload JPEG, PNG, WebP, and GIF files. New uploads enter the `Da approvare`
queue and only approved photos appear in the slideshow.

Optional PIN protection:

```bash
FRAME_ADMIN_PIN=1234 npm run server
```

The old static manifest still works as a fallback if the local photo server is not running.
Put images under `public/photos/` and list them in `public/photos/manifest.json`:

```json
{
  "photos": [
    { "src": "/photos/family-01.jpg", "caption": "Sunday lunch" },
    { "src": "/photos/family-02.jpg" }
  ]
}
```

## Telegram Photo Push

Telegram is optional and is only an ingestion channel: received images are saved as pending photos
and must be approved in `/admin`. Allowed Telegram users can also send `/refresh` to pull updates,
rebuild, and restart the systemd services when autostart is installed.

```bash
FRAME_TELEGRAM_BOT_TOKEN=123456:token \
FRAME_TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321 \
npm run server
```

If `FRAME_TELEGRAM_ALLOWED_CHAT_IDS` is empty, any chat that can message the bot can submit photos.
Prefer setting the allowlist for normal use.

## Autostart And Updates

The frame can be installed as user-level systemd services:

```bash
bash scripts/install-autostart.sh
```

This installs:

- `family-frame-server.service`: local app/API server on port `8787`, restarted on crash.
- `family-frame-kiosk.service`: Chromium kiosk, restarted on crash.
- `family-frame-update.timer`: periodic `git pull --ff-only` and rebuild every 30 minutes.

The update script refuses to pull when the working tree is dirty:

```bash
npm run update
```

Remote refresh hooks:

- LAN/admin: `POST http://FRAME_IP:8787/api/admin/refresh`, with `x-frame-admin-pin` if configured.
- Telegram: send `/refresh` to the allowed bot chat.

Chromium needs a graphical session. On this laptop, prefer enabling LXQt/SDDM autologin for the
`alessandro` user. If user services also need to run before manual login, run:

```bash
sudo loginctl enable-linger alessandro
```

## Calendar

By default the frame reads calendars through the local server endpoint at `/api/calendar.ics`.
The server proxies the configured private iCal feeds, caches them briefly, and keeps the calendar URLs
out of the browser config. For one calendar, provide the source feed with:

```bash
FRAME_CALENDAR_ICS_URL="https://calendar.google.com/calendar/ical/..." npm run server
```

For multiple calendars, use a private JSON sources file. Keep `.env` small and point it at the
file:

```bash
FRAME_CALENDAR_SOURCES_FILE=/home/alessandro/Code/frame/data/calendar-sources.json
```

Then create `data/calendar-sources.json`:

```json
{
  "sources": [
    { "label": "Famiglia", "icsUrl": "https://calendar.google.com/calendar/ical/family..." },
    { "label": "Scuola", "icsUrl": "https://calendar.google.com/calendar/ical/school..." },
    { "label": "Lavoro", "icsUrl": "https://calendar.google.com/calendar/ical/work..." }
  ]
}
```

`data/` is ignored by git, so the private iCal URLs stay local. A template is available at
`docs/calendar-sources.example.json`.

For the systemd service, keep the private URL in the project `.env` file:

```bash
cd /home/alessandro/Code/frame
nano .env
```

```bash
FRAME_CALENDAR_SOURCES_FILE=/home/alessandro/Code/frame/data/calendar-sources.json
```

The `.env` file is intentionally ignored by git because private iCal URLs are access tokens.

`/api/calendar.ics` merges every configured feed into one calendar. `/api/calendar-sources.json`
exposes only safe metadata to the browser: labels and per-source proxy endpoints. The private Google
URLs are never sent to the browser.

The frame highlights important events in two ways. Any title that starts with `!`, for example
`! Visita pediatra`, is highlighted and displayed without the prefix. It also highlights titles that
match the global `calendar.importantKeywords` dictionary in `public/frame.config.json`, with words
such as `compleanno`, `colloquio`, `visita`, `pediatra`, `scadenza`, `viaggio`, and `volo`.
The dictionary can be edited from `/admin`; changes are stored locally in `data/settings.sqlite` and
override the checked-in default config.

The older `FRAME_CALENDAR_ICS_URLS` comma-separated env var still works as a fallback, but it has no
labels and is less readable for 5-6 calendars.

For fully offline/static use, replace `public/calendar/family.ics` with an exported calendar and point
`frame.config.json` `calendar.icsUrl` back to `/calendar/family.ics`.

## Weather

Weather uses Open-Meteo. Set `weather.city` in `public/frame.config.json` to change location by city name:

```json
{
  "weather": {
    "city": "Portuense, Rome",
    "latitude": 41.8667,
    "longitude": 12.4569,
    "timezone": "Europe/Rome",
    "label": "Portuense, Roma",
    "showLocationLabel": false,
    "refreshMinutes": 30
  }
}
```

When `city` is set, the app resolves coordinates and timezone automatically. `latitude`,
`longitude`, `timezone`, and `label` remain as the offline fallback if geocoding is unavailable.
Set `showLocationLabel` to `false` to hide the fixed location name from the frame.

## DisplayLink Monitor Setup

The monitor is currently detected by USB, but Ubuntu does not expose it as an `xrandr` output until the DisplayLink driver is installed.

Install the official Synaptics driver:

```bash
bash scripts/install-displaylink-ubuntu.sh
sudo reboot
```

After reboot:

```bash
npm run display
npm run kiosk
```

`npm run kiosk` starts the photo server if needed and launches Chromium on
`http://127.0.0.1:8787` in kiosk mode.
It also disables X11 screen blanking, DPMS standby, and the classic X screensaver so the frame
does not disappear after the desktop idle timeout. To apply that manually in an already running
session:

```bash
npm run awake
```

The kiosk launcher reads `xrandr` and opens Chromium on the first connected display that is not `eDP-1`. On this laptop, the ASUS MB169B+ appears as `DVI-I-1-1` at `1920x1080+1920+0`.

If the output names change, override them:

```bash
FRAME_PRIMARY_OUTPUT=eDP-1 FRAME_DISPLAY_OUTPUT=DVI-I-1-1 npm run kiosk
```

Ubuntu's snap Chromium may print AppArmor, GTK, DBus, or IBUS warnings. They are noisy but usually non-fatal if the browser still opens.

For snap Chromium, the launcher uses this profile directory by default:

```bash
~/snap/chromium/common/family-frame-profile
```

Override the browser or profile if needed:

```bash
FRAME_CHROMIUM_BIN=chromium FRAME_CHROMIUM_PROFILE=~/snap/chromium/common/family-frame-profile npm run kiosk
```
