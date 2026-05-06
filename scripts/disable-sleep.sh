#!/usr/bin/env bash
set -euo pipefail

DISPLAY="${DISPLAY:-:0}"
export DISPLAY

if ! command -v xset >/dev/null 2>&1; then
  echo "xset was not found; cannot disable X11 blanking/DPMS." >&2
  exit 0
fi

if ! xset q >/dev/null 2>&1; then
  echo "X11 display $DISPLAY is not ready; cannot disable blanking/DPMS yet." >&2
  exit 0
fi

echo "Disabling X11 screen blanking, screensaver, and DPMS on $DISPLAY."
xset s off
xset s noblank
xset -dpms
xset dpms 0 0 0

if command -v xscreensaver-command >/dev/null 2>&1; then
  xscreensaver-command -exit >/dev/null 2>&1 || true
fi
