import { describe, expect, it } from "vitest";
import { parseEventTitle, parseEvents, uniqueCalendarEvents } from "../src/frame/lib/calendar";

const calendar = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:past
SUMMARY:Old
DTSTART:20260101T090000Z
DTEND:20260101T100000Z
END:VEVENT
BEGIN:VEVENT
UID:important
SUMMARY:! Visita pediatra
DTSTART:20260516T090000Z
DTEND:20260516T100000Z
END:VEVENT
BEGIN:VEVENT
UID:keyword
SUMMARY:Pagamento scuola
DTSTART:20260517T090000Z
DTEND:20260517T100000Z
END:VEVENT
BEGIN:VEVENT
UID:weekly
SUMMARY:Allenamento
DTSTART:20260518T170000Z
DTEND:20260518T180000Z
RRULE:FREQ=WEEKLY;COUNT=2
END:VEVENT
END:VCALENDAR`;

describe("calendar parsing", () => {
  it("strips explicit important markers and compact time prefixes", () => {
    expect(parseEventTitle("! 0830 Visita")).toEqual({
      title: "Visita",
      important: true
    });
  });

  it("parses important, keyword, and recurring events inside the lookahead window", () => {
    const events = parseEvents(calendar, 12, ["pagamento"], "Famiglia", new Date("2026-05-15T12:00:00Z"));

    expect(events.map((event) => event.title)).toEqual([
      "Visita pediatra",
      "Pagamento scuola",
      "Allenamento",
      "Allenamento"
    ]);
    expect(events[0].important).toBe(true);
    expect(events[1].important).toBe(true);
    expect(events.every((event) => event.calendarName === "Famiglia")).toBe(true);
  });

  it("deduplicates matching title and time pairs", () => {
    const startsAt = new Date("2026-05-16T09:00:00Z");
    const unique = uniqueCalendarEvents([
      { id: "1", title: "Visita", startsAt, allDay: false, important: false },
      { id: "2", title: " visita ", startsAt, allDay: false, important: true }
    ]);

    expect(unique).toHaveLength(1);
    expect(unique[0].id).toBe("1");
  });
});
