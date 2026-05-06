#!/usr/bin/env bash
set -euo pipefail

APP_URL="${FRAME_APP_URL:-http://127.0.0.1:5173}"
DISPLAY_VALUE="${DISPLAY:-:0}"
PRIMARY_OUTPUT="${FRAME_PRIMARY_OUTPUT:-eDP-1}"
FRAME_OUTPUT="${FRAME_DISPLAY_OUTPUT:-}"
CHROMIUM_BIN="${FRAME_CHROMIUM_BIN:-chromium}"
PHOTO_API_URL="${FRAME_PHOTO_API_URL:-http://127.0.0.1:8787/api/health}"

if ! command -v "$CHROMIUM_BIN" >/dev/null 2>&1; then
  echo "Chromium was not found. Install Chromium or set up another kiosk browser." >&2
  exit 1
fi

CHROMIUM_PATH="$(command -v "$CHROMIUM_BIN")"
if [[ "$CHROMIUM_PATH" == /snap/bin/* ]]; then
  DEFAULT_CHROMIUM_PROFILE="$HOME/snap/chromium/common/family-frame-profile"
else
  DEFAULT_CHROMIUM_PROFILE="${XDG_CACHE_HOME:-$HOME/.cache}/family-frame/chromium-profile"
fi
CHROMIUM_PROFILE="${FRAME_CHROMIUM_PROFILE:-$DEFAULT_CHROMIUM_PROFILE}"

if ! pgrep -f "server/photo-server.mjs" >/dev/null 2>&1; then
  npm run server >/tmp/family-frame-photo-server.log 2>&1 &
fi

for _ in {1..30}; do
  if curl -fsS "$PHOTO_API_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! pgrep -f "vite --host 0.0.0.0" >/dev/null 2>&1; then
  npm run dev >/tmp/family-frame-vite.log 2>&1 &
fi

for _ in {1..30}; do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if command -v xrandr >/dev/null 2>&1; then
  XRANDR_OUTPUT="$(xrandr --query)"

  if [[ -z "$FRAME_OUTPUT" ]]; then
    FRAME_OUTPUT="$(
      awk -v primary="$PRIMARY_OUTPUT" '/ connected/ && $1 != primary {print $1; exit}' <<<"$XRANDR_OUTPUT"
    )"
  fi

  if [[ -n "$FRAME_OUTPUT" ]]; then
    GEOMETRY="$(
      awk -v output="$FRAME_OUTPUT" '$1 == output && / connected/ {
        for (field = 1; field <= NF; field++) {
          if ($field ~ /^[0-9]+x[0-9]+[+-][0-9]+[+-][0-9]+$/) {
            print $field;
            exit;
          }
        }
      }' <<<"$XRANDR_OUTPUT"
    )"
  fi
fi

WINDOW_ARGS=()
if [[ -n "${GEOMETRY:-}" && "$GEOMETRY" =~ ^([0-9]+x[0-9]+)([+-][0-9]+)([+-][0-9]+)$ ]]; then
  SIZE="${BASH_REMATCH[1]}"
  X="${BASH_REMATCH[2]}"
  Y="${BASH_REMATCH[3]}"
  X="${X#+}"
  Y="${Y#+}"
  WINDOW_ARGS+=("--window-position=$X,$Y" "--window-size=$SIZE")
  echo "Launching kiosk on ${FRAME_OUTPUT:-external display} at ${SIZE}+${X}+${Y}."
else
  echo "Launching kiosk on Chromium's default display; no external xrandr geometry was found."
fi

mkdir -p "$CHROMIUM_PROFILE"
echo "Using Chromium profile: $CHROMIUM_PROFILE"

DISPLAY="$DISPLAY_VALUE" "$CHROMIUM_BIN" \
  --kiosk \
  --new-window \
  --user-data-dir="$CHROMIUM_PROFILE" \
  --disable-infobars \
  --no-first-run \
  --check-for-update-interval=31536000 \
  "${WINDOW_ARGS[@]}" \
  "$APP_URL"
