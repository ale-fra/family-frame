import { enabledCalendarSources } from "./settings-utils.mjs";

export function createCalendarService(runtime, settingsStore) {
  let calendarCache = {
    text: "",
    fetchedAt: 0
  };
  const sourceCalendarCache = new Map();

  function clearCalendarCache() {
    calendarCache = { text: "", fetchedAt: 0 };
    sourceCalendarCache.clear();
  }

  async function fetchCalendarIcs() {
    const sources = enabledCalendarSources(await settingsStore.readCalendarSourcesFromSettings());
    if (sources.length === 0) {
      throw new Error("Calendar sources are not configured");
    }

    const now = Date.now();
    if (calendarCache.text && now - calendarCache.fetchedAt < runtime.calendarCacheMs) {
      return calendarCache.text;
    }

    try {
      const calendars = await Promise.all(sources.map((source) => fetchCachedRemoteCalendar(source.icsUrl)));
      const calendarText = calendars.length === 1 ? calendars[0] : mergeCalendars(calendars);

      calendarCache = {
        text: calendarText,
        fetchedAt: now
      };
      return calendarText;
    } catch (error) {
      if (calendarCache.text) {
        console.warn("Using cached calendar after fetch failure:", error.message);
        return calendarCache.text;
      }
      throw error;
    }
  }

  async function fetchCachedRemoteCalendar(url) {
    const now = Date.now();
    const cached = sourceCalendarCache.get(url);
    if (cached?.text && now - cached.fetchedAt < runtime.calendarCacheMs) {
      return cached.text;
    }

    try {
      const text = await fetchRemoteCalendar(url);
      sourceCalendarCache.set(url, { text, fetchedAt: now });
      return text;
    } catch (error) {
      if (cached?.text) {
        console.warn("Using cached calendar source after fetch failure:", error.message);
        return cached.text;
      }
      throw error;
    }
  }

  return {
    clearCalendarCache,
    fetchCachedRemoteCalendar,
    fetchCalendarIcs
  };
}

export async function fetchRemoteCalendar(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) {
    throw new Error(`Calendar source returned ${response.status}`);
  }

  const calendarText = await response.text();
  if (!calendarText.includes("BEGIN:VCALENDAR")) {
    throw new Error("Response is not an iCalendar feed");
  }

  return calendarText;
}

export function mergeCalendars(calendars) {
  const body = calendars.flatMap(calendarComponentLines);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Frame//Calendar Merge//EN",
    ...body,
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}

export function calendarComponentLines(calendarText) {
  const lines = calendarText.split(/\r?\n/);
  const components = [];
  let depth = 0;
  let current = [];

  for (const line of lines) {
    if (line === "BEGIN:VEVENT" || line === "BEGIN:VTIMEZONE") {
      depth = 1;
      current = [line];
      continue;
    }

    if (depth === 0) continue;

    current.push(line);

    if (line.startsWith("BEGIN:")) {
      depth += 1;
      continue;
    }

    if (line.startsWith("END:")) {
      depth -= 1;
      if (depth === 0) {
        components.push(...current);
        current = [];
      }
    }
  }

  return components;
}
