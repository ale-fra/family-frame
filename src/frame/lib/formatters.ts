import type { FrameI18n } from "@/lib/types";
import type { CalendarEvent } from "../types";

// All dates follow the server's locale and time zone (FRAME_LOCALE, FRAME_TIMEZONE) rather than the browser's, so
// the clock, the calendar and the routine times agree even if the kiosk's system settings differ.

export function formatTime(date: Date, { locale, timeZone }: FrameI18n) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

export function formatFullDate(date: Date, { locale, timeZone }: FrameI18n) {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone }).format(date);
}

/** Forecast days are date-only strings ("2025-09-15"), parsed as UTC midnight: format them in UTC. */
export function formatDay(dateText: string, { locale }: FrameI18n) {
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(dateText));
}

/** All-day events keep their own calendar date (no time-zone shift); timed events use the server's zone. */
export function formatEventDate(event: CalendarEvent, { locale, timeZone }: FrameI18n) {
  if (event.allDay) {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(event.startsAt);
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone
  }).format(event.startsAt);
}
