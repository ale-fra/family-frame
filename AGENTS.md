# Agent Guide: Family Frame

## Scope

This repository is the portable Vite + React + TypeScript application and local Node.js photo service.
The separate sibling repository `../family-frame-device` owns the Ubuntu/X11 deployment, DisplayLink
setup, Chromium kiosk, systemd units, display power and Git-based device updates.
Do not add host commands or monitor-specific paths to this application's server or package scripts.

## Architecture

- `src/main.tsx` selects the frame and phone-oriented `/admin` entry points.
- `src/frame/` owns slideshow state, weather, calendar parsing, special days and display components.
- `src/admin/` owns photo and settings management.
- `src/styles.css` owns the full-screen frame layout; `src/admin.css` owns the admin theme.
- `server/photo-server.mjs` exports `startPhotoServer({ createActions })` for deployment injection.
- `server/lib/system-actions.mjs` provides the portable implementation: false capabilities and HTTP 501
  for unavailable device operations. It never starts host processes.
- `data/` stores private photos, metadata, logs and SQLite settings and is ignored by Git.
- `public/frame.config.json` is the runtime browser configuration. Keep root `frame.config.json` in sync.
- `FRAME_CONFIG_FILE` optionally overrides the configuration served by the production API server.
- `examples/` holds curated synthetic data. The sharing exporter never copies local public assets.
- `scripts/export-code-behaviors.mjs` creates a shareable archive from a positive file list, excluding
  Git, runtime data, local assets, deployment tools, agent instructions, dependencies and build output.

## Invariants

- New web and Telegram photos start pending; only approved photos enter the slideshow.
- Hidden and trashed photos remain in metadata but are not displayed.
- Keep private calendar URLs on the server. Browser APIs expose labeled proxy URLs.
- Preserve the bright outer passepartout: the actual ASUS monitor has bright edge bleed.
- Keep viewport edges light, avoid dark sidebars/letterboxing and use `object-fit: contain` for photos.
- Preserve 1920x1080 landscape readability without introducing a hardware requirement for development.
- Device controls in admin depend on `/api/admin/capabilities` and stay hidden in the portable runtime.

## Checks

Requires Node.js 24 or later.

```bash
npm ci
npm test
npm run build
npm run export:code-behaviors
```

For changes to device integration, also run the sibling repository's unit tests and shell syntax checks.
Live xrandr/kiosk verification requires the Ubuntu laptop and ASUS monitor; do not claim it from macOS.
When changing the frame's visual layout, check the actual ASUS display when available.
Do not include this file, skills, workflow files, personal data or credentials in a Taiga upload.
