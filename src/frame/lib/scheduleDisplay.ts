/**
 * Pure display logic for timers and routines on the frame: which items are on screen, in which phase,
 * in which order, and how remaining time is written. Times come from GET /api/schedule; `nowMs` is the
 * server-corrected clock (see clockSync.ts), so phases change locally between refreshes.
 */

import type { components } from "@/lib/api-schema";

export const MAX_VISIBLE_ITEMS = 3;
const MINUTE = 60_000;
const SOON_FRACTION = 0.2;
const SOON_MIN_MS = MINUTE;

// API shapes are generated from the OpenAPI document (src/lib/api-schema.ts): never redeclare them by hand.
export type ScheduleStyle = components["schemas"]["Style"];
export type PublicTimer = components["schemas"]["Timer"];
export type PublicOccurrence = components["schemas"]["Occurrence"];
export type PublicSchedule = components["schemas"]["PublicSchedule"];
export type ItemPhase = "counting" | "soon" | "ringing" | "paused";

export interface DisplayItem {
  key: string;
  kind: "timer" | "routine";
  title: string;
  icon: string | null;
  style: ScheduleStyle;
  phase: ItemPhase;
  /** Time left until it rings; 0 while ringing. */
  remainingMs: number;
  /** Length of the countdown: the timer duration, or the routine notice window. */
  totalMs: number;
  /** remainingMs / totalMs, 0–1: how much of the visual is still "full". */
  fraction: number;
  /** When it rings (or rang). For paused timers: if resumed now. */
  dueAtMs: number;
  ringingSinceMs: number | null;
}

export function buildDisplayItems(schedule: PublicSchedule, nowMs: number): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const timer of schedule.timers) {
    const item = timerItem(timer, nowMs);
    if (item) items.push(item);
  }
  for (const occurrence of schedule.routines) {
    const item = routineItem(occurrence, nowMs);
    if (item) items.push(item);
  }
  return items;
}

/** Ringing first (longest ringing first), then the soonest to ring, paused last. At most `max`. */
export function selectVisibleItems(items: DisplayItem[], max = MAX_VISIBLE_ITEMS) {
  const rank = (item: DisplayItem) => (item.phase === "ringing" ? 0 : item.phase === "paused" ? 2 : 1);
  const sorted = [...items].sort((left, right) =>
    rank(left) - rank(right)
    || (left.phase === "ringing" ? (left.ringingSinceMs ?? 0) - (right.ringingSinceMs ?? 0) : 0)
    || (left.phase === "paused" ? left.remainingMs - right.remainingMs : left.dueAtMs - right.dueAtMs));
  return { visible: sorted.slice(0, max), hiddenCount: Math.max(0, sorted.length - max) };
}

/**
 * Remaining time for children: whole minutes rounded up (never "0 min" while time is left), seconds in the
 * last minute, hours:minutes above one hour.
 */
export function formatRemaining(ms: number): { value: string; unit: "h" | "min" | "s" } {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return { value: String(seconds), unit: "s" };
  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 60) return { value: String(minutes), unit: "min" };
  return { value: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`, unit: "h" };
}

/**
 * "Sweets" style: at most 12 blocks. Each block is 10 seconds (timers of up to 2 minutes), or 1, 5, 10, 15, 30, 60
 * or 120 minutes.
 */
export function sweetsLayout(totalMs: number, remainingMs: number) {
  const total = Math.max(SWEET_UNITS_MS[0], totalMs);
  const unitMs = SWEET_UNITS_MS.find((unit) => Math.ceil(total / unit) <= 12) ?? SWEET_UNITS_MS[SWEET_UNITS_MS.length - 1];
  const remainingUnits = Math.max(0, remainingMs) / unitMs;
  const fills = Array.from({ length: Math.ceil(total / unitMs) }, (_, index) => clamp(remainingUnits - index, 0, 1));
  return { unitMs, fills };
}

const SWEET_UNITS_MS = [10_000, ...[1, 5, 10, 15, 30, 60, 120].map((minutes) => minutes * MINUTE)];

const MAX_REDRAW_WAIT_MS = MINUTE;

/**
 * Milliseconds until something on screen changes: a countdown reaching its next whole second (counted from its own
 * deadline, not the clock's seconds), an item appearing, starting to ring or leaving. The frame redraws exactly then,
 * so ringing starts on time and nothing redraws while nothing changes. At most a minute.
 */
export function nextDisplayChangeMs(schedule: PublicSchedule, nowMs: number): number {
  const moments: number[] = [];
  const untilNextSecond = (deadlineMs: number) => ((deadlineMs - nowMs) % 1000) || 1000;

  for (const timer of schedule.timers) {
    if (timer.status === "running" && timer.endsAt) {
      const endsAtMs = Date.parse(timer.endsAt);
      if (nowMs < endsAtMs) moments.push(untilNextSecond(endsAtMs));
      else if (timer.autoDismissMs > 0) moments.push(endsAtMs + timer.autoDismissMs - nowMs);
    } else if (timer.status === "finished" && timer.dismissAt) {
      moments.push(Date.parse(timer.dismissAt) - nowMs);
    }
  }
  for (const occurrence of schedule.routines) {
    const [showFromMs, atMs, dismissAtMs] = [occurrence.showFrom, occurrence.at, occurrence.dismissAt].map(Date.parse);
    if (nowMs < showFromMs) moments.push(showFromMs - nowMs);
    else if (nowMs < atMs) moments.push(untilNextSecond(atMs));
    else if (nowMs < dismissAtMs) moments.push(dismissAtMs - nowMs);
  }
  return Math.min(MAX_REDRAW_WAIT_MS, ...moments.filter((ms) => ms > 0));
}

/**
 * Angles (degrees clockwise from 12) for the "clock" style: the hands show the frame's local time, and the zone
 * runs from the minute hand to the due time on the minute dial (empty once due, almost a full turn beyond an hour).
 */
export function clockHands(nowMs: number, dueAtMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(nowMs));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const minutes = value("minute") + value("second") / 60;
  return {
    hourDeg: ((value("hour") % 12) + minutes / 60) * 30,
    minuteDeg: minutes * 6,
    zoneStartDeg: minutes * 6,
    zoneSweepDeg: clamp((dueAtMs - nowMs) / MINUTE, 0, 59.99) * 6
  };
}

function timerItem(timer: PublicTimer, nowMs: number): DisplayItem | null {
  const base = {
    key: `timer:${timer.id}`,
    kind: "timer" as const,
    title: timer.title,
    icon: timer.icon,
    style: timer.style,
    totalMs: timer.durationMs
  };

  if (timer.status === "paused") {
    return {
      ...base, phase: "paused", remainingMs: timer.remainingMs, fraction: clamp(timer.remainingMs / timer.durationMs, 0, 1),
      dueAtMs: nowMs + timer.remainingMs, ringingSinceMs: null
    };
  }

  const endsAtMs = Date.parse(timer.finishedAt ?? timer.endsAt ?? "");
  if (!Number.isFinite(endsAtMs) || (timer.status !== "running" && timer.status !== "finished")) return null;

  if (nowMs < endsAtMs) {
    const remainingMs = endsAtMs - nowMs;
    return {
      ...base, phase: countingPhase(remainingMs, timer.durationMs), remainingMs,
      fraction: clamp(remainingMs / timer.durationMs, 0, 1), dueAtMs: endsAtMs, ringingSinceMs: null
    };
  }

  // Ringing: also when the deadline passed locally before the server reported it. The server's dismissAt
  // wins when known; otherwise it is derived from autoDismissMs (0 = until cancelled).
  const dismissAtMs = timer.dismissAt
    ? Date.parse(timer.dismissAt)
    : timer.autoDismissMs > 0 ? endsAtMs + timer.autoDismissMs : Number.POSITIVE_INFINITY;
  if (nowMs >= dismissAtMs) return null;
  return { ...base, phase: "ringing", remainingMs: 0, fraction: 0, dueAtMs: endsAtMs, ringingSinceMs: endsAtMs };
}

function routineItem(occurrence: PublicOccurrence, nowMs: number): DisplayItem | null {
  if (occurrence.dismissed) return null;
  const atMs = Date.parse(occurrence.at);
  const showFromMs = Date.parse(occurrence.showFrom);
  const dismissAtMs = Date.parse(occurrence.dismissAt);
  if (nowMs < showFromMs || nowMs >= dismissAtMs) return null;

  const totalMs = occurrence.noticeMinutes * MINUTE;
  const base = {
    key: `routine:${occurrence.routineId}:${occurrence.date}`,
    kind: "routine" as const,
    title: occurrence.title,
    icon: occurrence.icon,
    style: occurrence.style,
    totalMs,
    dueAtMs: atMs
  };
  if (nowMs >= atMs) return { ...base, phase: "ringing", remainingMs: 0, fraction: 0, ringingSinceMs: atMs };
  const remainingMs = atMs - nowMs;
  return {
    ...base, phase: countingPhase(remainingMs, totalMs), remainingMs,
    fraction: totalMs > 0 ? clamp(remainingMs / totalMs, 0, 1) : 0, ringingSinceMs: null
  };
}

function countingPhase(remainingMs: number, totalMs: number): ItemPhase {
  return remainingMs <= Math.max(SOON_MIN_MS, totalMs * SOON_FRACTION) ? "soon" : "counting";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
