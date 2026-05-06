#!/usr/bin/env bash
set -euo pipefail

DISPLAY="${DISPLAY:-:0}"
export DISPLAY

for _ in {1..60}; do
  if xrandr --query >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

npm run display || true
exec npm run kiosk
