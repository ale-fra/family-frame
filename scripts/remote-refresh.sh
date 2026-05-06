#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${FRAME_REFRESH_LOG:-/tmp/family-frame-refresh.log}"

exec > >(tee -a "$LOG_FILE") 2>&1

cd "$ROOT_DIR"
echo "[$(date --iso-8601=seconds)] Refresh requested by ${FRAME_REFRESH_SOURCE:-unknown}."

bash scripts/update-and-build.sh

if command -v systemctl >/dev/null 2>&1 && systemctl --user is-enabled family-frame-server.service >/dev/null 2>&1; then
  systemctl --user restart family-frame-server.service
fi

if command -v systemctl >/dev/null 2>&1 && systemctl --user is-enabled family-frame-kiosk.service >/dev/null 2>&1; then
  systemctl --user restart family-frame-kiosk.service
fi

echo "[$(date --iso-8601=seconds)] Refresh complete."
