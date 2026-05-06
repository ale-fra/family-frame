#!/usr/bin/env bash
set -euo pipefail

if ! command -v xrandr >/dev/null 2>&1; then
  echo "xrandr is required but was not found." >&2
  exit 1
fi

PRIMARY_OUTPUT="${FRAME_PRIMARY_OUTPUT:-eDP-1}"
MODE="${FRAME_DISPLAY_MODE:-1920x1080}"

mapfile -t CONNECTED_OUTPUTS < <(xrandr --query | awk '/ connected/ {print $1}')

FRAME_OUTPUT="${FRAME_DISPLAY_OUTPUT:-}"
if [[ -z "$FRAME_OUTPUT" ]]; then
  for output in "${CONNECTED_OUTPUTS[@]}"; do
    if [[ "$output" != "$PRIMARY_OUTPUT" ]]; then
      FRAME_OUTPUT="$output"
      break
    fi
  done
fi

if [[ -z "$FRAME_OUTPUT" ]]; then
  echo "No external connected display was found. Install/configure DisplayLink first." >&2
  xrandr --query
  exit 1
fi

echo "Configuring $FRAME_OUTPUT at $MODE in landscape mode."
xrandr --output "$FRAME_OUTPUT" --mode "$MODE" --rotate normal --right-of "$PRIMARY_OUTPUT"
