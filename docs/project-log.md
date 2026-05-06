# Family Frame Project Log

This log captures the practical build history for the family frame project. It is written as source material for a future blog post: what was built, why decisions were made, what failed, and how the system evolved.

## Goal

Repurpose an old ASUS MB169B+/MB168B+ USB DisplayLink monitor and an Ubuntu laptop into an always-on digital family frame.

The frame should show:

- local family photos;
- current weather and short forecast;
- important events from an `.ics` calendar;
- a phone-friendly way to add and approve photos;
- a kiosk/autostart setup that survives reboot and crashes.

## Hardware And Environment

- Host: Dell Latitude laptop.
- OS: Ubuntu 24.04.x with X11/LXQt.
- Display: ASUS MB169B+ class USB DisplayLink monitor.
- External output after DisplayLink setup: `DVI-I-1-1`.
- Layout: laptop panel `eDP-1` at `1920x1080+0+0`, frame display at `1920x1080+1920+0`.
- Target: landscape `1920x1080`.

Important visual constraint: the USB monitor has bright edge bleed on dark content. The UI intentionally keeps all outer edges light and avoids black full-screen backgrounds.

## Initial Application

The first version was a local-first Vite + React + TypeScript app:

- React app loaded `/frame.config.json`.
- Photos came from `public/photos/manifest.json`.
- Weather came directly from Open-Meteo.
- Calendar events came from a local or remote `.ics` source parsed in-browser with `ical.js`.
- `scripts/setup-display.sh` configured the external DisplayLink monitor through `xrandr`.
- `scripts/start-kiosk.sh` launched Chromium in kiosk mode on the external monitor.

At this stage, adding photos required manually copying files into `public/photos/` and editing the manifest.

## Dynamic Photo Upload Strategy

The main product requirement became: upload photos from a phone and decide what appears on the frame.

The chosen strategy:

- Web admin on the local network for full control.
- Telegram bot as optional remote ingestion.
- New photos enter a `pending` queue.
- Only approved photos enter the slideshow.
- Hidden and trashed photos remain locally tracked but are not shown.
- Slideshow selection uses a shuffled queue to avoid obvious repetition.

Alternatives considered:

- Native iOS/Android app: deferred because it adds a lot of maintenance.
- PWA share target: useful for Android, less reliable as a cross-platform v1 because iOS support is limited.
- Telegram-only: good for remote push, but not good enough as the primary admin surface.

## Local Photo Service

A small Node/Express service was added in `server/photo-server.mjs`.

Responsibilities:

- receive multipart image uploads;
- store images under `data/photos/`;
- store metadata in `data/photos.json`;
- expose approved photos to the frame via `/api/photos?status=approved`;
- expose admin APIs for upload and status changes;
- serve uploaded media from `/media/photos/`;
- optionally poll Telegram for incoming photos.

The app now has:

- `/` for the frame display;
- `/admin` for phone admin;
- `/api/admin/photos` for managing photo state;
- `/api/admin/refresh` for remote refresh.

`data/` is ignored by git because it is runtime state.

## Admin UI Issue: No Scroll On Phone

Problem: after uploading photos from the phone, the admin page could not scroll far enough to reach approval buttons.

Root cause: the frame UI intentionally used `body { overflow: hidden; }` for kiosk mode. The admin route inherited that global rule.

Fix:

- added CSS that switches body/root overflow when `.admin-shell` is present;
- kept the kiosk frame unchanged.

Result: `/admin` scrolls normally on phone while `/` remains fixed full-screen.

## GitHub Setup

A private GitHub repository was created:

- Repository: `ale-fra/family-frame`
- Branch: `main`

Initial commits:

- `52ae1ad Add dynamic photo admin`
- `d748c5d Add autostart and remote refresh`
- `00a9cd5 Fix systemd runtime path`
- `50544cd Keep kiosk service attached to Chromium`

## Production Runtime Shift

The runtime was changed from Vite dev server to a single local production server.

Before:

- Vite served the frontend on port `5173`.
- Node served APIs/media on port `8787`.

After:

- `npm run build` creates `dist/`.
- `server/photo-server.mjs` serves `dist/`, `/api`, and `/media` on port `8787`.
- Frame URL: `http://127.0.0.1:8787/`.
- Admin URL from phone: `http://FRAME_IP:8787/admin`.
- Kiosk uses port `8787` by default.

Reason: fewer moving parts for an always-on appliance.

## Autostart And Updates

Systemd user services were added:

- `family-frame-server.service`: local app/API server, restarted on crash.
- `family-frame-kiosk.service`: Chromium kiosk, restarted on crash.
- `family-frame-update.timer`: periodic update check every 30 minutes.
- `family-frame-update.service`: runs safe update and restarts services.

Scripts added:

- `scripts/update-and-build.sh`
  - refuses to pull if working tree is dirty;
  - runs `git pull --ff-only`;
  - runs `npm ci` when dependencies change;
  - runs `npm run build`.
- `scripts/remote-refresh.sh`
  - runs update/build;
  - restarts systemd services when installed.
- `scripts/install-autostart.sh`
  - installs systemd user unit files;
  - enables server, kiosk, and timer.
- `scripts/start-frame-session.sh`
  - waits for X11/xrandr;
  - runs display setup;
  - starts kiosk.

`loginctl enable-linger alessandro` was enabled so user services can survive better across boot/session boundaries. Chromium still needs a graphical session, so LXQt/SDDM autologin remains important.

## Systemd PATH Issue

Problem: after installing autostart, services failed with `status=127`.

Symptoms:

- server service failed at `npm run server`;
- kiosk service failed at `npm run kiosk`;
- journal showed `npm: No such file or directory`.

Root cause: Node/NPM were installed through `nvm` under:

```text
/home/alessandro/.config/nvm/versions/node/v24.15.0/bin
```

Systemd user services do not inherit the interactive shell's `nvm` PATH.

Fix:

- added explicit `PATH` to the systemd user services;
- included `/snap/bin` so Chromium installed through snap is visible.

Result:

- `family-frame-server.service` became `active (running)`;
- API health check returned `{"ok":true}`;
- kiosk could find Chromium.

## Kiosk Restart Loop

Problem: Chromium kept stealing focus every few seconds.

Symptoms:

- `family-frame-kiosk.service` repeatedly restarted;
- journal showed the service exiting successfully and systemd scheduling a restart;
- many Chromium renderer processes accumulated.

Root cause:

- Snap Chromium launches the browser process and then the wrapper command returns with exit `0`.
- systemd saw the kiosk script as complete.
- Because the service used `Restart=always`, it relaunched Chromium every few seconds.

Fix:

- changed `scripts/start-kiosk.sh` to launch Chromium in the background;
- monitor for the real Chromium process using the dedicated `family-frame-profile`;
- keep the script alive while Chromium is alive;
- exit only if Chromium really disappears.

One subtle bug appeared during the fix:

- the process pattern started with `--user-data-dir=...`;
- `pgrep` treated that as an option;
- fixed by calling `pgrep -f -- "$KIOSK_PATTERN"`.

Result:

- `family-frame-kiosk.service` remains `active (running)`;
- systemd no longer restarts it every few seconds;
- focus stealing loop stopped.

## Remote Refresh Hooks

Remote update can be triggered in two ways:

- LAN/admin API: `POST /api/admin/refresh`.
- Telegram: send `/refresh` from an allowed chat.

The refresh path runs:

```text
scripts/remote-refresh.sh -> scripts/update-and-build.sh -> systemd user service restart
```

This gives a way to push code changes to GitHub and then ask the frame to refresh without using SSH directly.

## Current Operational Commands

Development:

```bash
npm run server
npm run dev
```

Production local runtime:

```bash
npm run build
npm run server
```

Autostart:

```bash
bash scripts/install-autostart.sh
sudo loginctl enable-linger alessandro
```

Status checks:

```bash
systemctl --user status family-frame-server.service family-frame-kiosk.service family-frame-update.timer
curl -fsS http://127.0.0.1:8787/api/health
journalctl --user -u family-frame-kiosk.service -n 100 --no-pager
```

## Validation Done So Far

- `npm run build`
- `bash -n scripts/*.sh`
- `node --check server/photo-server.mjs`
- `systemd-analyze verify --user systemd/user/*.service systemd/user/*.timer`
- Manual systemd start/restart checks
- API health check on port `8787`
- Confirmed Chromium kiosk launches on `DVI-I-1-1` at `1920x1080+1920+0`

## Open Follow-Ups

- Test a full reboot and confirm autologin plus kiosk startup.
- Add a small admin UI button for refresh instead of API-only refresh.
- Add better photo validation, such as checking image magic bytes and dimensions.
- Add thumbnail generation to reduce admin page bandwidth.
- Add a simple `/status` admin view for service/update state.
- Consider Telegram status responses for `/refresh`, upload duplicates, and rejected files.
- Add a backup/export flow for `data/photos.json` and uploaded images.

## Blog Angles

Potential post titles:

- "Turning an Old USB DisplayLink Monitor Into a Family Photo Frame"
- "Building a Local-First Digital Family Frame With React, systemd, and Telegram"
- "The Hard Parts of a Simple Digital Frame: DisplayLink, Kiosk Mode, and Autostart"

Interesting technical details to include:

- why light UI edges mattered because of LCD edge bleed;
- why a local Node service was necessary once phone upload became a requirement;
- why Vite dev server was removed from production;
- how systemd user services differ from interactive shell sessions;
- how Snap Chromium returning early caused a restart loop;
- why the implementation keeps `.ics` and Open-Meteo simple instead of adding a backend too early.
