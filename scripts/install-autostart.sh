#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

mkdir -p "$SYSTEMD_USER_DIR"
cp "$ROOT_DIR"/systemd/user/*.service "$ROOT_DIR"/systemd/user/*.timer "$SYSTEMD_USER_DIR"/

systemctl --user daemon-reload
systemctl --user enable family-frame-update.timer family-frame-server.service family-frame-kiosk.service
systemctl --user restart family-frame-server.service family-frame-kiosk.service
systemctl --user start family-frame-update.timer

cat <<MSG
Family Frame autostart installed.

For start after reboot before manual login, enable graphical autologin for user ${USER}.
If you also want user services to run before login, run:
  sudo loginctl enable-linger ${USER}
MSG
