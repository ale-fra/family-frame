// Builds GET /api/schedule bodies for frame tests, relative to a given moment.
import type { PublicOccurrence, PublicSchedule, PublicTimer, ScheduleStyle } from "../../src/frame/lib/scheduleDisplay";

export const MINUTE = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
let sequence = 0;

type TimerOptions = {
  title?: string;
  icon?: string | null;
  style?: ScheduleStyle;
  durationMs?: number;
  remainingMs?: number;
  status?: "running" | "paused" | "finished";
  ringingForMs?: number;
  autoDismissMs?: number;
};

export function timer(now: number, options: TimerOptions = {}): PublicTimer {
  const {
    title = "Pasta pronta", icon = "pot", style = "disc", durationMs = 10 * MINUTE, remainingMs = durationMs,
    status = "running", ringingForMs = 0, autoDismissMs = MINUTE
  } = options;
  const base = {
    id: `t${++sequence}`, title, icon, style, durationMs, autoDismissMs, closedAt: null,
    createdAt: iso(now), updatedAt: iso(now)
  };
  if (status === "paused") return { ...base, status, remainingMs, endsAt: null, finishedAt: null, dismissAt: null };
  if (status === "finished") {
    const finished = now - ringingForMs;
    return { ...base, status, remainingMs: 0, endsAt: iso(finished), finishedAt: iso(finished), dismissAt: iso(finished + autoDismissMs) };
  }
  return { ...base, status, remainingMs, endsAt: iso(now + remainingMs), finishedAt: null, dismissAt: null };
}

type OccurrenceOptions = { title?: string; icon?: string | null; style?: ScheduleStyle; inMs: number; noticeMinutes?: number };

export function occurrence(now: number, { title = "Scuola", icon = "backpack", style = "clock", inMs, noticeMinutes = 15 }: OccurrenceOptions): PublicOccurrence {
  const at = now + inMs;
  return {
    routineId: `r${++sequence}`, title, icon, style, date: iso(at).slice(0, 10), at: iso(at),
    showFrom: iso(at - noticeMinutes * MINUTE), dismissAt: iso(at + MINUTE), noticeMinutes, dismissed: false
  };
}

export function schedule(now: number, timers: PublicTimer[] = [], routines: PublicOccurrence[] = []): PublicSchedule {
  return { serverTime: iso(now), timeZone: "Europe/Rome", timers, routines };
}
