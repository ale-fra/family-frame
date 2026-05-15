import * as React from "react";
import type { FrameConfig } from "@/lib/types";
import type { CalendarEvent } from "../types";
import { calendarSources, compareCalendarEvents, parseEvents, uniqueCalendarEvents } from "../lib/calendar";

export function useCalendarEvents(config: FrameConfig["calendar"]) {
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadCalendarEvents() {
      const sources = await calendarSources(config);
      const loadedEvents = await Promise.allSettled(
        sources.map(async (source) => {
          const response = await fetch(source.icsUrl, { cache: "no-store" });
          if (!response.ok) throw new Error(`Calendar unavailable: ${source.label}`);
          const calendarText = await response.text();
          return parseEvents(calendarText, config.lookaheadDays, config.importantKeywords, source.label);
        })
      );

      if (cancelled) return;

      setEvents(
        uniqueCalendarEvents(loadedEvents.flatMap((result) => (result.status === "fulfilled" ? result.value : [])))
          .sort(compareCalendarEvents)
      );
    }

    loadCalendarEvents().catch(() => {
      if (!cancelled) setEvents([]);
    });

    const interval = window.setInterval(() => {
      loadCalendarEvents().catch(() => {
        if (!cancelled) setEvents([]);
      });
    }, Math.max(5, config.refreshMinutes) * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [config]);

  return events;
}
