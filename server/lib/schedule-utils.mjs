// Pure helpers for timers and routine appointments: input validation, wall-clock/time-zone
// conversion and recurrence expansion. No I/O; the SQLite layer lives in schedule-store.mjs.

export const TIMER_MIN_DURATION_MS = 1_000;
export const TIMER_MAX_DURATION_MS = 24 * 60 * 60 * 1_000;
export const TITLE_MAX_LENGTH = 80;
export const ROUTINE_FREQUENCIES = ["daily", "weekly", "monthly"];
export const MAX_INTERVAL = { daily: 365, weekly: 52, monthly: 12 };
export const DEFAULT_NOTICE_MINUTES = 15;
export const MAX_NOTICE_MINUTES = 24 * 60;
export const DEFAULT_TIMER_AUTO_DISMISS_MS = 60_000;
export const MAX_TIMER_AUTO_DISMISS_MS = 60 * 60 * 1_000;
// Routines always leave the screen on their own (there is no touchscreen to dismiss them), so no 0.
export const DEFAULT_ROUTINE_AUTO_DISMISS_MS = 60_000;
export const MIN_ROUTINE_AUTO_DISMISS_MS = 1_000;
export const MAX_ROUTINE_AUTO_DISMISS_MS = 60 * 60 * 1_000;
// How a countdown is drawn on the frame. Default per kind from FRAME_TIMER_STYLE / FRAME_ROUTINE_STYLE.
export const SCHEDULE_STYLES = ["disc", "sweets", "journey", "clock"];
export const DEFAULT_TIMER_STYLE = "disc";
export const DEFAULT_ROUTINE_STYLE = "clock";
export const ICON_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const ICON_KEY_MAX_LENGTH = 40;
// The frame shows at most 3 items side by side; the API refuses a 4th active timer.
export const MAX_ACTIVE_TIMERS = 3;
// Index = Date#getDay() (0 = Sunday), also the bit position in routines.weekdays_mask.
export const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// API output order: Monday first.
const WEEKDAY_DISPLAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const TIMER_FIELDS = ["title", "durationMs", "autoDismissMs", "style", "icon"];
const ROUTINE_FIELDS = [
  "title", "time", "recurrence", "startDate", "endDate", "noticeMinutes", "autoDismissMs", "style", "icon"
];
const RECURRENCE_FIELDS = {
  daily: ["frequency", "interval"],
  weekly: ["frequency", "interval", "weekdays"],
  monthly: ["frequency", "interval", "monthDay"]
};

const DAY_MS = 86_400_000;
// Long enough to reach the next match for any allowed interval plus several skipped occurrences.
const SEARCH_HORIZON_DAYS = 800;

export class ScheduleError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "ScheduleError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function invalid(message) {
  return new ScheduleError(400, "invalid-input", message);
}

export function notFound(message) {
  return new ScheduleError(404, "not-found", message);
}

export function conflict(message) {
  return new ScheduleError(409, "invalid-transition", message);
}

// ---------------------------------------------------------------------------
// Input normalization (throws ScheduleError 400 on invalid input)
// ---------------------------------------------------------------------------

export function normalizeTitle(value) {
  if (typeof value !== "string") throw invalid("title is required");
  const title = value.trim().replace(/\s+/g, " ");
  if (!title) throw invalid("title is required");
  if (title.length > TITLE_MAX_LENGTH) throw invalid(`title must be at most ${TITLE_MAX_LENGTH} characters`);
  return title;
}

/** Rejects fields outside `allowed`, so typos ("weekday", "duration") fail loudly instead of being ignored. */
export function assertKnownFields(payload, allowed, prefix = "") {
  for (const key of Object.keys(payload)) {
    if (!allowed.includes(key)) throw invalid(`Unknown field: ${prefix}${key}`);
  }
}

export function normalizeObjectPayload(payload, what) {
  if (payload === undefined || payload === null) return {};
  if (!isPlainObject(payload)) throw invalid(`${what} payload must be an object`);
  return payload;
}

export function normalizeDurationMs(value, field = "durationMs") {
  if (!Number.isInteger(value) || value < TIMER_MIN_DURATION_MS || value > TIMER_MAX_DURATION_MS) {
    throw invalid(`${field} must be an integer between ${TIMER_MIN_DURATION_MS} and ${TIMER_MAX_DURATION_MS}`);
  }
  return value;
}

export function normalizeAutoDismissMs(value) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_TIMER_AUTO_DISMISS_MS) {
    throw invalid(`autoDismissMs must be an integer between 0 (never) and ${MAX_TIMER_AUTO_DISMISS_MS}`);
  }
  return value;
}

export function normalizeStyle(value) {
  if (!SCHEDULE_STYLES.includes(value)) throw invalid(`style must be one of ${SCHEDULE_STYLES.join(", ")}`);
  return value;
}

/** Icon key such as "pot" or "backpack"; null = the default icon of the kind. Unknown keys are allowed. */
export function normalizeIcon(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > ICON_KEY_MAX_LENGTH || !ICON_KEY_PATTERN.test(value)) {
    throw invalid(`icon must be null or a lowercase key like "pot" (a-z, 0-9, dashes; max ${ICON_KEY_MAX_LENGTH})`);
  }
  return value;
}

export function normalizeTimerInput(payload, {
  defaultAutoDismissMs = DEFAULT_TIMER_AUTO_DISMISS_MS,
  defaultStyle = DEFAULT_TIMER_STYLE
} = {}) {
  if (!isPlainObject(payload)) throw invalid("timer payload must be an object");
  assertKnownFields(payload, TIMER_FIELDS);
  return {
    title: normalizeTitle(payload.title),
    durationMs: normalizeDurationMs(payload.durationMs),
    autoDismissMs: payload.autoDismissMs === undefined
      ? defaultAutoDismissMs
      : normalizeAutoDismissMs(payload.autoDismissMs),
    style: payload.style === undefined ? defaultStyle : normalizeStyle(payload.style),
    icon: payload.icon === undefined ? null : normalizeIcon(payload.icon)
  };
}

/** Partial timer update. Only the provided fields are returned. */
export function normalizeTimerPatch(payload) {
  if (!isPlainObject(payload)) throw invalid("timer payload must be an object");
  assertKnownFields(payload, TIMER_FIELDS);
  if (Object.keys(payload).length === 0) throw invalid(`Provide at least one of: ${TIMER_FIELDS.join(", ")}`);
  const patch = {};
  if (payload.title !== undefined) patch.title = normalizeTitle(payload.title);
  if (payload.durationMs !== undefined) patch.durationMs = normalizeDurationMs(payload.durationMs);
  if (payload.autoDismissMs !== undefined) patch.autoDismissMs = normalizeAutoDismissMs(payload.autoDismissMs);
  if (payload.style !== undefined) patch.style = normalizeStyle(payload.style);
  if (payload.icon !== undefined) patch.icon = normalizeIcon(payload.icon);
  return patch;
}

export function normalizeDeltaMs(payload) {
  if (!isPlainObject(payload)) throw invalid("add-time payload must be an object");
  assertKnownFields(payload, ["deltaMs"]);
  if (!Number.isInteger(payload.deltaMs) || payload.deltaMs === 0) {
    throw invalid("deltaMs must be a non-zero integer (negative to remove time)");
  }
  return payload.deltaMs;
}

/** Partial routine update: validates the shape; the store merges it and re-validates the whole routine. */
export function normalizeRoutinePatch(payload) {
  if (!isPlainObject(payload)) throw invalid("routine payload must be an object");
  assertKnownFields(payload, ROUTINE_FIELDS);
  if (Object.keys(payload).length === 0) throw invalid(`Provide at least one of: ${ROUTINE_FIELDS.join(", ")}`);
  return payload;
}

export function normalizeRoutineAutoDismissMs(value) {
  if (!Number.isInteger(value) || value < MIN_ROUTINE_AUTO_DISMISS_MS || value > MAX_ROUTINE_AUTO_DISMISS_MS) {
    throw invalid(`autoDismissMs must be an integer between ${MIN_ROUTINE_AUTO_DISMISS_MS} and ${MAX_ROUTINE_AUTO_DISMISS_MS}`);
  }
  return value;
}

export function normalizeRoutineInput(payload, {
  today,
  defaultAutoDismissMs = DEFAULT_ROUTINE_AUTO_DISMISS_MS,
  defaultStyle = DEFAULT_ROUTINE_STYLE
}) {
  if (!isPlainObject(payload)) throw invalid("routine payload must be an object");
  assertKnownFields(payload, ROUTINE_FIELDS);

  const time = normalizeClockTimeStrict(payload.time);
  if (!time) throw invalid("time must be HH:MM (24h)");

  const recurrence = normalizeRecurrence(payload.recurrence);

  const startDate = payload.startDate === undefined ? today : normalizeDateString(payload.startDate);
  if (!startDate) throw invalid("startDate must be YYYY-MM-DD");

  let endDate = null;
  if (payload.endDate !== undefined && payload.endDate !== null) {
    endDate = normalizeDateString(payload.endDate);
    if (!endDate) throw invalid("endDate must be YYYY-MM-DD");
    if (endDate < startDate) throw invalid("endDate must not be before startDate");
  }

  const noticeMinutes = payload.noticeMinutes === undefined ? DEFAULT_NOTICE_MINUTES : payload.noticeMinutes;
  if (!Number.isInteger(noticeMinutes) || noticeMinutes < 0 || noticeMinutes > MAX_NOTICE_MINUTES) {
    throw invalid(`noticeMinutes must be an integer between 0 and ${MAX_NOTICE_MINUTES}`);
  }

  const autoDismissMs = payload.autoDismissMs === undefined
    ? defaultAutoDismissMs
    : normalizeRoutineAutoDismissMs(payload.autoDismissMs);

  return {
    title: normalizeTitle(payload.title),
    time,
    recurrence,
    startDate,
    endDate,
    noticeMinutes,
    autoDismissMs,
    style: payload.style === undefined ? defaultStyle : normalizeStyle(payload.style),
    icon: payload.icon === undefined ? null : normalizeIcon(payload.icon)
  };
}

export function normalizeRecurrence(value) {
  if (!isPlainObject(value)) throw invalid("recurrence is required");
  const { frequency } = value;
  if (!ROUTINE_FREQUENCIES.includes(frequency)) {
    throw invalid(`recurrence.frequency must be one of ${ROUTINE_FREQUENCIES.join(", ")}`);
  }
  assertKnownFields(value, RECURRENCE_FIELDS[frequency], "recurrence.");

  const interval = value.interval === undefined ? 1 : value.interval;
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL[frequency]) {
    throw invalid(`recurrence.interval must be an integer between 1 and ${MAX_INTERVAL[frequency]}`);
  }

  if (frequency === "weekly") {
    return { frequency, interval, weekdays: normalizeWeekdays(value.weekdays) };
  }

  if (frequency === "monthly") {
    if (!Number.isInteger(value.monthDay) || value.monthDay < 1 || value.monthDay > 31) {
      throw invalid("recurrence.monthDay must be an integer between 1 and 31");
    }
    return { frequency, interval, monthDay: value.monthDay };
  }

  return { frequency, interval };
}

/**
 * Weekdays are three-letter English names ("mon" … "sun"), case-insensitive.
 * Numbers are rejected on purpose: 0–6 is ambiguous (Sunday=0 in JS, Monday=1 in ISO 8601).
 */
export function normalizeWeekdays(value) {
  const hint = `use ${WEEKDAY_DISPLAY_ORDER.map((day) => `"${day}"`).join(", ")}`;
  if (!Array.isArray(value) || value.length === 0) {
    throw invalid(`recurrence.weekdays must list at least one weekday; ${hint}`);
  }
  const names = new Set();
  for (const entry of value) {
    const name = typeof entry === "string" ? entry.trim().toLowerCase() : "";
    if (!WEEKDAY_NAMES.includes(name)) throw invalid(`recurrence.weekdays has an invalid entry ${JSON.stringify(entry)}; ${hint}`);
    names.add(name);
  }
  return WEEKDAY_DISPLAY_ORDER.filter((day) => names.has(day));
}

export function normalizeClockTimeStrict(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(trimmed) ? trimmed : "";
}

export function normalizeDateString(value) {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function isoOrNull(ms) {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Weekday bitmask (bit n = weekday n, 0=Sunday … 6=Saturday, matching Date#getDay)
// ---------------------------------------------------------------------------

export function weekdaysToMask(weekdays) {
  return weekdays.reduce((mask, name) => mask | (1 << WEEKDAY_NAMES.indexOf(name)), 0);
}

export function maskToWeekdays(mask) {
  return WEEKDAY_DISPLAY_ORDER.filter((name) => mask & (1 << WEEKDAY_NAMES.indexOf(name)));
}

// ---------------------------------------------------------------------------
// Civil dates as day numbers (days since 1970-01-01), free of time-zone effects
// ---------------------------------------------------------------------------

export function dateToDayNumber(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function dayNumberToDate(dayNumber) {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOfDayNumber(dayNumber) {
  return (((dayNumber + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday (4)
}

function mondayWeekIndex(dayNumber) {
  return Math.floor((dayNumber + 3) / 7); // weeks start on Monday
}

// ---------------------------------------------------------------------------
// Time-zone conversion
// ---------------------------------------------------------------------------

const formatterCache = new Map();

function zonedFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock fields of an instant in a time zone. */
export function zonedParts(instantMs, timeZone) {
  const parts = {};
  for (const { type, value } of zonedFormatter(timeZone).formatToParts(new Date(instantMs))) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return parts;
}

/** Local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function zonedDateString(instantMs, timeZone) {
  const { year, month, day } = zonedParts(instantMs, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function offsetMs(instantMs, timeZone) {
  const flooredMs = Math.floor(instantMs / 1000) * 1000;
  const { year, month, day, hour, minute, second } = zonedParts(flooredMs, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - flooredMs;
}

/**
 * Converts a local wall-clock date/time to a UTC instant.
 * Ambiguous times (DST fall-back) resolve to the earlier instant; non-existent times
 * (DST spring-forward gap) move forward by the gap length, e.g. 02:30 → 03:30.
 */
export function zonedTimeToInstant(dateString, time, timeZone) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetBefore = offsetMs(wallClockAsUtc - DAY_MS / 2, timeZone);
  const offsetAfter = offsetMs(wallClockAsUtc + DAY_MS / 2, timeZone);

  const candidates = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => wallClockAsUtc - offset)
    .filter((instant) => offsetMs(instant, timeZone) === wallClockAsUtc - instant)
    .sort((a, b) => a - b);
  if (candidates.length > 0) return candidates[0];
  return wallClockAsUtc - offsetBefore;
}

// ---------------------------------------------------------------------------
// Recurrence expansion
// ---------------------------------------------------------------------------

/** Whether a routine's recurrence rule produces an occurrence on a local date. */
export function recurrenceMatchesDate(routine, dateString) {
  if (dateString < routine.startDate) return false;
  if (routine.endDate && dateString > routine.endDate) return false;

  const { recurrence } = routine;
  const dayNumber = dateToDayNumber(dateString);
  const startDayNumber = dateToDayNumber(routine.startDate);

  if (recurrence.frequency === "daily") {
    return (dayNumber - startDayNumber) % recurrence.interval === 0;
  }

  if (recurrence.frequency === "weekly") {
    if (!recurrence.weekdays.includes(WEEKDAY_NAMES[weekdayOfDayNumber(dayNumber)])) return false;
    return (mondayWeekIndex(dayNumber) - mondayWeekIndex(startDayNumber)) % recurrence.interval === 0;
  }

  if (recurrence.frequency === "monthly") {
    const [year, month, day] = dateString.split("-").map(Number);
    const [startYear, startMonth] = routine.startDate.split("-").map(Number);
    const monthsSinceStart = (year * 12 + month) - (startYear * 12 + startMonth);
    if (monthsSinceStart % recurrence.interval !== 0) return false;
    // monthDay 31 means "last day" in shorter months rather than skipping them.
    return day === Math.min(recurrence.monthDay, daysInMonth(year, month));
  }

  return false;
}

/**
 * Occurrences of a routine whose instant is in the half-open window (fromMs, toMs].
 * Honors status (cancelled/paused + resumeOn) and skipped dates; dismissed dates are
 * still returned, flagged, so the UI can decide how to render them.
 *
 * @param routine view object from the store ({ status, resumeOn, startDate, endDate, time, recurrence })
 * @param options { fromMs, toMs?, timeZone, exceptions?: Map<date, kind>, limit? }
 */
export function listOccurrences(routine, { fromMs, toMs = Infinity, timeZone, exceptions = new Map(), limit = 50 }) {
  if (routine.status === "cancelled") return [];
  if (routine.status === "paused" && !routine.resumeOn) return [];

  const earliestDate = [zonedDateString(fromMs, timeZone), routine.startDate, routine.resumeOn || ""]
    .sort()
    .at(-1);
  const firstDay = dateToDayNumber(earliestDate);
  const occurrences = [];

  for (let dayNumber = firstDay; dayNumber < firstDay + SEARCH_HORIZON_DAYS; dayNumber += 1) {
    const date = dayNumberToDate(dayNumber);
    if (routine.endDate && date > routine.endDate) break;
    if (!recurrenceMatchesDate(routine, date)) continue;

    const atMs = zonedTimeToInstant(date, routine.time, timeZone);
    if (atMs > toMs) break;
    if (atMs <= fromMs) continue;

    const exception = exceptions.get(date);
    if (exception === "skipped") continue;

    occurrences.push({ date, atMs, dismissed: exception === "dismissed" });
    if (occurrences.length >= limit) break;
  }

  return occurrences;
}

export function nextOccurrence(routine, options) {
  return listOccurrences(routine, { ...options, limit: 1 })[0] || null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
