// Pure helpers of the timer command line (server/timer-cli.mjs).

const UNITS = { h: 3_600_000, m: 60_000, s: 1_000 };

/** "3m", "90s", "1h30m", "2m30s"; a plain number means minutes. Returns milliseconds, or null. */
export function parseDuration(text) {
  const value = String(text ?? "").trim().toLowerCase();
  if (/^\d+$/.test(value)) return Number(value) > 0 ? Number(value) * UNITS.m : null;
  if (!/^(\d+h)?(\d+m)?(\d+s)?$/.test(value) || value === "") return null;
  let total = 0;
  for (const [, amount, unit] of value.matchAll(/(\d+)([hms])/g)) total += Number(amount) * UNITS[unit];
  return total > 0 ? total : null;
}

/** 161000 → "2:41", 3723000 → "1:02:03". Rounds up, so it never shows 0:00 while time is left. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** <duration> [title] [--style <style>] [--icon <icon>]  →  { durationMs, title, style, icon }, or null. */
export function parseTimerArgs(args) {
  const [duration, ...rest] = args;
  const durationMs = parseDuration(duration);
  if (durationMs === null) return null;
  const result = { durationMs, title: "Timer", style: undefined, icon: undefined };
  const words = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--style" || arg === "--icon") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) return null;
      result[arg.slice(2)] = value;
      index += 1;
    } else if (arg.startsWith("--")) {
      return null;
    } else {
      words.push(arg);
    }
  }
  if (words.length > 0) result.title = words.join(" ");
  return result;
}
