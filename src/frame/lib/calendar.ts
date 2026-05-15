import ICAL from "ical.js";
import type { CalendarSource, CalendarSourcesManifest, FrameConfig } from "@/lib/types";
import type { CalendarEvent } from "../types";

export async function calendarSources(calendar: FrameConfig["calendar"]): Promise<CalendarSource[]> {
  const configuredSources = normalizeCalendarSources(calendar.sources);

  if (configuredSources.length > 0) return configuredSources;

  const manifestSources = await fetchCalendarSourcesManifest(calendar);
  if (manifestSources.length > 0) return manifestSources;

  return [{
    label: "Famiglia",
    icsUrl: calendar.icsUrl
  }];
}

async function fetchCalendarSourcesManifest(calendar: FrameConfig["calendar"]) {
  if (!calendar.sourcesUrl) return [];

  try {
    const response = await fetch(calendar.sourcesUrl, { cache: "no-store" });
    if (!response.ok) return [];
    const manifest = await response.json() as CalendarSourcesManifest;
    return normalizeCalendarSources(manifest.sources);
  } catch {
    return [];
  }
}

export function normalizeCalendarSources(sources: CalendarSource[] | undefined) {
  return sources
    ?.filter((source) => source.enabled !== false && typeof source.icsUrl === "string" && source.icsUrl.trim())
    .map((source) => ({
      ...source,
      label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : "Calendario",
      icsUrl: source.icsUrl.trim()
    })) || [];
}

export function parseEvents(
  calendarText: string,
  lookaheadDays: number,
  keywords: string[],
  calendarName?: string,
  now = new Date()
): CalendarEvent[] {
  const jcal = ICAL.parse(calendarText);
  const component = new ICAL.Component(jcal);
  const until = new Date(now);
  until.setDate(until.getDate() + lookaheadDays);
  until.setHours(23, 59, 59, 999);
  const normalizedKeywords = keywords.map((keyword) => keyword.toLocaleLowerCase());
  const events: CalendarEvent[] = [];

  component.getAllSubcomponents("vevent").forEach((vevent, index) => {
    const event = new ICAL.Event(vevent);
    const parsedTitle = parseEventTitle(event.summary || "Untitled event");
    const title = parsedTitle.title;
    const sourceId = calendarName || "calendar";
    const baseId = `${sourceId}-${event.uid || `${title}-${index}`}`;
    const important = parsedTitle.important || titleMatchesImportantKeyword(title, normalizedKeywords);

    if (event.isRecurrenceException()) return;

    if (event.isRecurring()) {
      const iterator = event.iterator();
      let occurrence: ICAL.Time | null;
      let guard = 0;

      while ((occurrence = iterator.next()) && guard < 1000) {
        guard += 1;
        const details = event.getOccurrenceDetails(occurrence);
        const startsAt = details.startDate.toJSDate();
        const endsAt = details.endDate?.toJSDate();
        const effectiveEnd = endsAt ?? startsAt;

        if (effectiveEnd < now) continue;
        if (startsAt > until) break;

        events.push({
          id: `${baseId}-${startsAt.toISOString()}`,
          title,
          calendarName,
          startsAt,
          endsAt,
          allDay: details.startDate.isDate,
          important
        });
      }

      return;
    }

    events.push({
      id: baseId,
      title,
      calendarName,
      startsAt: event.startDate.toJSDate(),
      endsAt: event.endDate?.toJSDate(),
      allDay: event.startDate.isDate,
      important
    });
  });

  return uniqueCalendarEvents(events)
    .filter((event) => {
      const effectiveEnd = event.endsAt ?? event.startsAt;
      return effectiveEnd >= now && event.startsAt <= until;
    })
    .sort(compareCalendarEvents);
}

export function titleMatchesImportantKeyword(title: string, normalizedKeywords: string[]) {
  const normalizedTitle = title.toLocaleLowerCase();
  return normalizedKeywords.some((keyword) => normalizedTitle.includes(keyword));
}

export function parseEventTitle(rawTitle: string) {
  const trimmedTitle = rawTitle.trim();
  const important = trimmedTitle.startsWith("!");
  const titleWithoutFlag = important ? trimmedTitle.replace(/^!\s*/, "") : trimmedTitle;
  const titleWithoutTimePrefix = stripLeadingCompactTime(titleWithoutFlag);

  return {
    title: titleWithoutTimePrefix || titleWithoutFlag || rawTitle,
    important
  };
}

export function stripLeadingCompactTime(title: string) {
  return title.replace(/^\d{4}(?:\s+|[-:.]\s*)/, "").trim();
}

export function uniqueCalendarEvents(events: CalendarEvent[]) {
  const seen = new Set<string>();
  const uniqueEvents: CalendarEvent[] = [];

  for (const event of events) {
    const key = [
      event.title.trim().toLowerCase(),
      event.startsAt.getTime(),
      event.endsAt?.getTime() ?? "",
      event.allDay ? "all-day" : "timed"
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    uniqueEvents.push(event);
  }

  return uniqueEvents;
}

export function compareCalendarEvents(left: CalendarEvent, right: CalendarEvent) {
  const startDifference = left.startsAt.getTime() - right.startsAt.getTime();
  if (startDifference !== 0) return startDifference;

  const leftEnd = left.endsAt?.getTime() ?? left.startsAt.getTime();
  const rightEnd = right.endsAt?.getTime() ?? right.startsAt.getTime();
  const endDifference = leftEnd - rightEnd;
  if (endDifference !== 0) return endDifference;

  return left.title.localeCompare(right.title);
}
