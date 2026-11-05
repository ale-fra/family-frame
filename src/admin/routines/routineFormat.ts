// Pure helpers for the Routines section: readable summaries and the form ↔ API payload mapping.
import type { components } from "@/lib/api-schema";
import type { FrameI18n } from "@/lib/types";
import { routineMessages } from "./messages";

export type Routine = components["schemas"]["Routine"];
export type Recurrence = components["schemas"]["Recurrence"];
export type Weekday = components["schemas"]["Weekday"];
export type ScheduleStyle = components["schemas"]["Style"];
export type RoutinePayload = components["schemas"]["RoutineCreate"];
export type Frequency = Recurrence["frequency"];

export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WORKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND: Weekday[] = ["sat", "sun"];

export type RoutineForm = {
  title: string;
  time: string;
  frequency: Frequency;
  interval: number;
  weekdays: Weekday[];
  monthDay: number;
  startDate: string;
  endDate: string;
  noticeMinutes: number;
  autoDismissMs: number;
  style: ScheduleStyle;
  icon: string | null;
};

export const NOTICE_OPTIONS = [0, 5, 10, 15, 30, 60];
export const RING_OPTIONS = [30_000, 60_000, 120_000, 300_000];
export const PRESETS: Record<"weekdays" | "weekend" | "everyDay", Weekday[]> = {
  weekdays: WORKDAYS,
  weekend: WEEKEND,
  everyDay: WEEKDAYS
};

export function emptyRoutineForm(today: string): RoutineForm {
  return {
    title: "", time: "08:00", frequency: "weekly", interval: 1, weekdays: [...WORKDAYS], monthDay: 1,
    startDate: today, endDate: "", noticeMinutes: 15, autoDismissMs: 60_000, style: "clock", icon: null
  };
}

export function routineToForm(routine: Routine): RoutineForm {
  const { recurrence } = routine;
  return {
    title: routine.title,
    time: routine.time,
    frequency: recurrence.frequency,
    interval: recurrence.interval,
    weekdays: recurrence.frequency === "weekly" ? [...recurrence.weekdays] : [...WORKDAYS],
    monthDay: recurrence.frequency === "monthly" ? recurrence.monthDay : 1,
    startDate: routine.startDate,
    endDate: routine.endDate ?? "",
    noticeMinutes: routine.noticeMinutes,
    autoDismissMs: routine.autoDismissMs,
    style: routine.style,
    icon: routine.icon
  };
}

export function formToPayload(form: RoutineForm): RoutinePayload & { recurrence: Recurrence } {
  const recurrence: Recurrence = form.frequency === "weekly"
    ? { frequency: "weekly", interval: form.interval, weekdays: WEEKDAYS.filter((day) => form.weekdays.includes(day)) }
    : form.frequency === "monthly"
      ? { frequency: "monthly", interval: form.interval, monthDay: form.monthDay }
      : { frequency: "daily", interval: form.interval };
  return {
    title: form.title.trim(),
    time: form.time,
    recurrence,
    startDate: form.startDate,
    endDate: form.endDate || null,
    noticeMinutes: form.noticeMinutes,
    autoDismissMs: form.autoDismissMs,
    style: form.style,
    icon: form.icon
  };
}

export function describeRecurrence(recurrence: Recurrence, language: string | undefined): string {
  const t = routineMessages(language);
  if (recurrence.frequency === "daily") {
    return recurrence.interval === 1 ? t.everyDay : t.everyNDays(recurrence.interval);
  }
  if (recurrence.frequency === "monthly") {
    return recurrence.monthDay === 31
      ? t.monthlyLastDay(recurrence.interval)
      : t.monthlyOnDay(recurrence.interval, recurrence.monthDay);
  }
  const days = WEEKDAYS.filter((day) => recurrence.weekdays.includes(day));
  const list = days.map((day) => t.weekdayShort[day]).join(", ");
  if (recurrence.interval > 1) return t.everyNWeeks(recurrence.interval, list);
  if (days.length === 7) return t.everyDay;
  if (sameDays(days, WORKDAYS)) return t.mondayToFriday;
  if (sameDays(days, WEEKEND)) return t.weekends;
  return t.everyWeekdays(list);
}

export function describeRoutine(routine: Pick<Routine, "recurrence" | "time" | "noticeMinutes">, language: string | undefined) {
  const t = routineMessages(language);
  return `${describeRecurrence(routine.recurrence, language)} ${t.atTime(routine.time)} · ${t.withNotice(routine.noticeMinutes)}`;
}

/** "oggi alle 08:10" / "tomorrow at 08:10" / "Fri 19 Sept at 08:10", in the frame's time zone. */
export function formatNextOccurrence(at: string, nowMs: number, i18n: FrameI18n, language: string | undefined) {
  const t = routineMessages(language);
  const atMs = Date.parse(at);
  const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: i18n.timeZone }).format(ms);
  const time = new Intl.DateTimeFormat(i18n.locale, { hour: "2-digit", minute: "2-digit", timeZone: i18n.timeZone }).format(atMs);
  const today = localDate(nowMs);
  const tomorrow = localDate(nowMs + 24 * 3_600_000);
  const day = localDate(atMs) === today
    ? t.today
    : localDate(atMs) === tomorrow
      ? t.tomorrow
      : new Intl.DateTimeFormat(i18n.locale, { weekday: "short", day: "numeric", month: "short", timeZone: i18n.timeZone }).format(atMs);
  return `${day} ${t.atTime(time)}`;
}

/** "oggi alle 08:10" / "gio 18 set alle 08:10" for an occurrence given by its local date (e.g. a skipped one). */
export function formatOccurrenceDay(date: string, time: string, nowMs: number, i18n: FrameI18n, language: string | undefined) {
  const t = routineMessages(language);
  const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: i18n.timeZone }).format(ms);
  const day = date === localDate(nowMs)
    ? t.today
    : date === localDate(nowMs + 24 * 3_600_000) ? t.tomorrow : formatLocalDate(date, i18n);
  return `${day} ${t.atTime(time)}`;
}

/** "lun 22 set" for a YYYY-MM-DD date: a calendar date, so it is formatted without any time-zone shift. */
export function formatLocalDate(date: string, { locale }: FrameI18n) {
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function sameDays(left: Weekday[], right: Weekday[]) {
  return left.length === right.length && right.every((day) => left.includes(day));
}
