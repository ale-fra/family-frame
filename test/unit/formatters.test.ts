import { describe, expect, it } from "vitest";
import { formatDay, formatEventDate, formatFullDate, formatTime } from "../../src/frame/lib/formatters";
import type { CalendarEvent } from "../../src/frame/types";

// 2025-09-15 06:10 UTC = 08:10 in Rome = 02:10 in New York.
const INSTANT = new Date("2025-09-15T06:10:00Z");
const rome = { locale: "it-IT", timeZone: "Europe/Rome" };
const london = { locale: "en-GB", timeZone: "Europe/London" };
const newYork = { locale: "en-US", timeZone: "America/New_York" };

describe("frame formatters follow FRAME_LOCALE and FRAME_TIMEZONE, not the browser", () => {
  it("formats the clock in the server's time zone and the configured locale", () => {
    expect(formatTime(INSTANT, rome)).toBe("08:10");
    expect(formatTime(INSTANT, london)).toBe("07:10");
    expect(formatTime(INSTANT, newYork)).toMatch(/^02:10\s?AM$/);
  });

  it("writes dates in the configured language", () => {
    expect(formatFullDate(INSTANT, rome)).toBe("lunedì 15 settembre");
    expect(formatFullDate(INSTANT, london)).toBe("Monday 15 September");
  });

  it("keeps the weekday of date-only forecast days in every time zone", () => {
    expect(formatDay("2025-09-15", rome)).toBe("lun");
    expect(formatDay("2025-09-15", { locale: "en-GB", timeZone: "America/Los_Angeles" })).toBe("Mon");
  });

  it("shows timed events in the server's time zone and all-day events on their own date", () => {
    const timed = { allDay: false, startsAt: INSTANT } as CalendarEvent;
    expect(formatEventDate(timed, rome)).toBe("lun 15 set, 08:10");
    const allDay = { allDay: true, startsAt: new Date(2025, 8, 15) } as CalendarEvent;
    expect(formatEventDate(allDay, { locale: "en-GB", timeZone: "Pacific/Kiritimati" })).toBe("Mon 15 Sept");
  });

  it("falls back to the browser time zone when the server does not say", () => {
    expect(formatTime(INSTANT, { locale: "it-IT" })).toMatch(/^\d{2}:10$/);
  });
});
