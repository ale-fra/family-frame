import crypto from "node:crypto";

export function normalizeSettings(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const settings = {};
  const calendarSources = payload.calendar?.sources;
  const importantKeywords = payload.calendar?.importantKeywords;
  if (calendarSources !== undefined || importantKeywords !== undefined) {
    settings.calendar = {};
    if (calendarSources !== undefined) {
      if (!Array.isArray(calendarSources)) return null;
      const normalizedSources = normalizeCalendarSources(calendarSources);
      if (!normalizedSources) return null;
      settings.calendar.sources = normalizedSources;
    }
    if (importantKeywords !== undefined) {
      if (!Array.isArray(importantKeywords)) return null;
      settings.calendar.importantKeywords = normalizeStringList(importantKeywords);
    }
  }

  const disabledSpecialDayIds = payload.specialDays?.disabledIds;
  const specialDayEvents = payload.specialDays?.events;
  if (disabledSpecialDayIds !== undefined || specialDayEvents !== undefined) {
    if (disabledSpecialDayIds !== undefined && !Array.isArray(disabledSpecialDayIds)) return null;
    if (specialDayEvents !== undefined && !Array.isArray(specialDayEvents)) return null;
    const normalizedEvents = specialDayEvents === undefined
      ? undefined
      : normalizeSpecialDayEvents(specialDayEvents);
    if (specialDayEvents !== undefined && !normalizedEvents) return null;
    settings.specialDays = {
      disabledIds: normalizeStringList(disabledSpecialDayIds || [])
    };
    if (normalizedEvents) settings.specialDays.events = normalizedEvents;
  }

  const nightMode = payload.display?.nightMode;
  if (nightMode !== undefined) {
    const normalizedNightMode = normalizeNightDisplaySettings(nightMode);
    if (!normalizedNightMode) return null;
    settings.display = { nightMode: normalizedNightMode };
  }

  const pinnedPhotoId = payload.slideshow?.pinnedPhotoId;
  if (pinnedPhotoId !== undefined) {
    if (pinnedPhotoId !== null && typeof pinnedPhotoId !== "string") return null;
    settings.slideshow = {
      pinnedPhotoId: typeof pinnedPhotoId === "string" ? pinnedPhotoId.trim() : ""
    };
  }

  return settings;
}

export function mergeSettings(currentSettings, nextSettings) {
  return {
    ...currentSettings,
    ...nextSettings,
    calendar: {
      ...currentSettings.calendar,
      ...nextSettings.calendar
    },
    display: {
      ...currentSettings.display,
      ...nextSettings.display
    },
    slideshow: {
      ...currentSettings.slideshow,
      ...nextSettings.slideshow
    },
    specialDays: {
      ...currentSettings.specialDays,
      ...nextSettings.specialDays
    }
  };
}

export function normalizeStringList(values) {
  return [...new Set(values
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))];
}

export function normalizeCalendarSources(sources) {
  const normalized = [];
  const seenIds = new Set();
  const seenUrls = new Set();

  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const icsUrl = typeof source.icsUrl === "string" ? source.icsUrl.trim() : "";
    if (!icsUrl) continue;
    const id = typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : calendarSourceId(source.label, icsUrl);
    const uniqueId = uniqueCalendarSourceId(id, seenIds);
    const urlKey = icsUrl.toLocaleLowerCase();
    if (seenUrls.has(urlKey)) continue;
    seenIds.add(uniqueId);
    seenUrls.add(urlKey);
    normalized.push({
      id: uniqueId,
      label: typeof source.label === "string" && source.label.trim()
        ? source.label.trim()
        : `Calendario ${normalized.length + 1}`,
      icsUrl,
      enabled: source.enabled !== false
    });
  }

  return normalized;
}

export function enabledCalendarSources(sources) {
  return sources.filter((source) => source.enabled !== false && typeof source.icsUrl === "string" && source.icsUrl.trim());
}

export function normalizeNightDisplaySettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const enabled = settings.enabled === true;
  const offTime = normalizeClockTime(settings.offTime);
  const onTime = normalizeClockTime(settings.onTime);
  const output = typeof settings.output === "string" && settings.output.trim()
    ? settings.output.trim()
    : "DVI-I-1-1";

  if (!offTime || !onTime) return null;

  return {
    enabled,
    offTime,
    onTime,
    output
  };
}

export function normalizeClockTime(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(trimmed) ? trimmed : "";
}

export function normalizeSpecialDayEvents(events) {
  const normalized = [];
  const seenIds = new Set();

  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) return null;
    const id = typeof event.id === "string" ? event.id.trim() : "";
    const label = typeof event.label === "string" ? event.label.trim() : "";
    const theme = typeof event.theme === "string" ? event.theme.trim() : "";
    const effects = Array.isArray(event.effects) ? normalizeStringList(event.effects) : [];
    const schedule = normalizeSpecialDaySchedule(event.schedule);
    if (!id || !label || !theme || effects.length === 0 || !schedule || seenIds.has(id)) return null;
    seenIds.add(id);
    normalized.push({
      id,
      label,
      enabled: event.enabled !== false,
      theme,
      schedule,
      effects
    });
  }

  return normalized;
}

export function normalizeSpecialDaySchedule(schedule) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return null;

  if (schedule.type === "fixedDate") {
    const month = normalizeInteger(schedule.month, 1, 12);
    const day = normalizeInteger(schedule.day, 1, daysInMonth(month || 1));
    if (!month || !day) return null;
    return { type: "fixedDate", month, day };
  }

  if (schedule.type === "dateRange") {
    const start = normalizeMonthDay(schedule.start);
    const end = normalizeMonthDay(schedule.end);
    if (!start || !end) return null;
    return { type: "dateRange", start, end };
  }

  if (schedule.type === "nthWeekday") {
    const month = normalizeInteger(schedule.month, 1, 12);
    const weekday = normalizeInteger(schedule.weekday, 0, 6);
    const nth = normalizeInteger(schedule.nth, 1, 5);
    if (!month || weekday === null || !nth) return null;
    return { type: "nthWeekday", month, weekday, nth };
  }

  if (schedule.type === "easterOffset") {
    const offsetDays = normalizeInteger(schedule.offsetDays, -30, 30);
    const durationDays = normalizeInteger(schedule.durationDays ?? 1, 1, 7);
    if (offsetDays === null || !durationDays) return null;
    return { type: "easterOffset", offsetDays, durationDays };
  }

  return null;
}

export function normalizeMonthDay(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const month = normalizeInteger(value.month, 1, 12);
  const day = normalizeInteger(value.day, 1, daysInMonth(month || 1));
  if (!month || !day) return null;
  return { month, day };
}

export function normalizeInteger(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

export function daysInMonth(month) {
  return new Date(2024, month, 0).getDate();
}

export function calendarSourceId(label, icsUrl) {
  const base = String(label || "calendario")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "calendario";
  return `${base}-${crypto.createHash("sha1").update(icsUrl).digest("hex").slice(0, 8)}`;
}

export function uniqueCalendarSourceId(id, seenIds) {
  let candidate = id;
  let counter = 2;
  while (seenIds.has(candidate)) {
    candidate = `${id}-${counter}`;
    counter += 1;
  }
  return candidate;
}
