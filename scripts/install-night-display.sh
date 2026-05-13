#!/usr/bin/env bash
set -euo pipefail

SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
FRAME_DISPLAY_OUTPUT="${FRAME_DISPLAY_OUTPUT:-DVI-I-1-1}"
FRAME_X11_DISPLAY="${FRAME_X11_DISPLAY:-${DISPLAY:-:0}}"
FRAME_XAUTHORITY="${FRAME_XAUTHORITY:-${XAUTHORITY:-$HOME/.Xauthority}}"
FRAME_NIGHT_OFF_TIME="${FRAME_NIGHT_OFF_TIME:-23:00}"
FRAME_MORNING_ON_TIME="${FRAME_MORNING_ON_TIME:-07:00}"
FRAME_NIGHT_DISPLAY_ENABLED="${FRAME_NIGHT_DISPLAY_ENABLED:-1}"

validate_time() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
    echo "$name must use HH:MM in 24-hour time, got: $value" >&2
    exit 1
  fi
}

validate_time FRAME_NIGHT_OFF_TIME "$FRAME_NIGHT_OFF_TIME"
validate_time FRAME_MORNING_ON_TIME "$FRAME_MORNING_ON_TIME"

mkdir -p "$SYSTEMD_USER_DIR"

if [[ "$FRAME_NIGHT_DISPLAY_ENABLED" != "1" && "$FRAME_NIGHT_DISPLAY_ENABLED" != "true" ]]; then
  systemctl --user disable --now family-frame-display-off.timer family-frame-display-on.timer >/dev/null 2>&1 || true
  systemctl --user daemon-reload
  echo "Family Frame night display timers disabled."
  exit 0
fi

cat >"$SYSTEMD_USER_DIR/family-frame-display-off.service" <<SERVICE
[Unit]
Description=Turn off Family Frame display overnight
After=graphical-session.target

[Service]
Type=oneshot
Environment=DISPLAY=$FRAME_X11_DISPLAY
Environment=XAUTHORITY=$FRAME_XAUTHORITY
ExecStart=/usr/bin/env systemctl --user stop family-frame-kiosk.service
ExecStart=/usr/bin/env xrandr --output $FRAME_DISPLAY_OUTPUT --off
SERVICE

cat >"$SYSTEMD_USER_DIR/family-frame-display-off.timer" <<TIMER
[Unit]
Description=Turn off Family Frame display overnight

[Timer]
OnCalendar=*-*-* $FRAME_NIGHT_OFF_TIME:00
Persistent=true

[Install]
WantedBy=timers.target
TIMER

cat >"$SYSTEMD_USER_DIR/family-frame-display-on.service" <<SERVICE
[Unit]
Description=Turn on Family Frame display in the morning
After=graphical-session.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env systemctl --user restart family-frame-kiosk.service
SERVICE

cat >"$SYSTEMD_USER_DIR/family-frame-display-on.timer" <<TIMER
[Unit]
Description=Turn on Family Frame display in the morning

[Timer]
OnCalendar=*-*-* $FRAME_MORNING_ON_TIME:00
Persistent=true

[Install]
WantedBy=timers.target
TIMER

systemctl --user daemon-reload
systemctl --user enable --now family-frame-display-off.timer family-frame-display-on.timer

cat <<MSG
Family Frame night display timers installed.

Display output: $FRAME_DISPLAY_OUTPUT
X11 display: $FRAME_X11_DISPLAY
Xauthority: $FRAME_XAUTHORITY
Off time: $FRAME_NIGHT_OFF_TIME
On time: $FRAME_MORNING_ON_TIME

Check timers with:
  systemctl --user list-timers 'family-frame-display-*'

Change times by rerunning, for example:
  FRAME_NIGHT_OFF_TIME=22:30 FRAME_MORNING_ON_TIME=07:30 bash scripts/install-night-display.sh
MSG
