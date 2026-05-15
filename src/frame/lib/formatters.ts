import type { CalendarEvent } from "../types";

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

export function formatDay(dateText: string) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(new Date(dateText));
}

export function formatEventDate(event: CalendarEvent) {
  if (event.allDay) {
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(event.startsAt);
  }
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(event.startsAt);
}
