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
and must be approved in `/admin`.

```bash
FRAME_TELEGRAM_BOT_TOKEN=123456:token \
FRAME_TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321 \
npm run server
```

If `FRAME_TELEGRAM_ALLOWED_CHAT_IDS` is empty, any chat that can message the bot can submit photos.
Prefer setting the allowlist for normal use.

## Calendar

Replace `public/calendar/family.ics` with an exported family calendar, or change `frame.config.json` to point `calendar.icsUrl` at another `.ics` URL.

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

`npm run kiosk` starts the photo server, starts Vite, and launches Chromium on
`http://127.0.0.1:5173` in kiosk mode.

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
