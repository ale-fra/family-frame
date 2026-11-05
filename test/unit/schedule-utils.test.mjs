import { describe, expect, it } from "vitest";
import {
  listOccurrences,
  maskToWeekdays,
  normalizeRecurrence,
  normalizeRoutineInput,
  normalizeTimerInput,
  recurrenceMatchesDate,
  weekdaysToMask,
  zonedTimeToInstant
} from "../../server/lib/schedule-utils.mjs";

const rome = "Europe/Rome";
const iso = (ms) => new Date(ms).toISOString();

describe("zonedTimeToInstant", () => {
  it("converts wall-clock times using the zone's current offset", () => {
    expect(iso(zonedTimeToInstant("2025-01-15", "08:10", rome))).toBe("2025-01-15T07:10:00.000Z");
    expect(iso(zonedTimeToInstant("2025-07-01", "08:10", rome))).toBe("2025-07-01T06:10:00.000Z");
  });

  it("moves times in the spring-forward gap forward", () => {
    expect(iso(zonedTimeToInstant("2025-03-30", "02:30", rome))).toBe("2025-03-30T01:30:00.000Z"); // 03:30 CEST
    expect(iso(zonedTimeToInstant("2025-03-09", "02:30", "America/New_York"))).toBe("2025-03-09T07:30:00.000Z");
  });

  it("resolves ambiguous fall-back times to the earlier instant", () => {
    expect(iso(zonedTimeToInstant("2025-10-26", "02:30", rome))).toBe("2025-10-26T00:30:00.000Z"); // 02:30 CEST
    expect(iso(zonedTimeToInstant("2025-11-02", "01:30", "America/New_York"))).toBe("2025-11-02T05:30:00.000Z");
  });
});

describe("recurrence rules", () => {
  const base = { startDate: "2025-09-01", endDate: null, time: "08:10", status: "active", resumeOn: null };

  it("stores weekday names as a Sunday-based bitmask", () => {
    expect(weekdaysToMask(["mon", "tue", "wed", "thu", "fri"])).toBe(62);
    expect(maskToWeekdays(62)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(maskToWeekdays(weekdaysToMask(["sun", "sat"]))).toEqual(["sat", "sun"]);
  });

  it("matches weekday-only routines", () => {
    const routine = { ...base, recurrence: { frequency: "weekly", interval: 1, weekdays: ["mon", "tue", "wed", "thu", "fri"] } };
    expect(recurrenceMatchesDate(routine, "2025-09-12")).toBe(true); // Friday
    expect(recurrenceMatchesDate(routine, "2025-09-13")).toBe(false); // Saturday
    expect(recurrenceMatchesDate(routine, "2025-08-29")).toBe(false); // before startDate
  });

  it("anchors every-N-weeks on the start date's Monday-based week", () => {
    // 2025-09-03 is a Wednesday; the Monday of the following week is out, two weeks later is in.
    const routine = { ...base, startDate: "2025-09-03", recurrence: { frequency: "weekly", interval: 2, weekdays: ["mon"] } };
    expect(recurrenceMatchesDate(routine, "2025-09-01")).toBe(false); // before start
    expect(recurrenceMatchesDate(routine, "2025-09-08")).toBe(false);
    expect(recurrenceMatchesDate(routine, "2025-09-15")).toBe(true);
  });

  it("anchors every-N-days on the start date", () => {
    const routine = { ...base, recurrence: { frequency: "daily", interval: 3 } };
    expect(["2025-09-01", "2025-09-02", "2025-09-04"].map((d) => recurrenceMatchesDate(routine, d)))
      .toEqual([true, false, true]);
  });

  it("clamps monthly day 31 to the last day of shorter months", () => {
    const routine = { ...base, startDate: "2025-01-01", recurrence: { frequency: "monthly", interval: 1, monthDay: 31 } };
    expect(recurrenceMatchesDate(routine, "2025-02-28")).toBe(true);
    expect(recurrenceMatchesDate(routine, "2024-02-29")).toBe(false); // before start
    expect(recurrenceMatchesDate(routine, "2025-04-30")).toBe(true);
    expect(recurrenceMatchesDate(routine, "2025-05-30")).toBe(false);
    expect(recurrenceMatchesDate(routine, "2025-05-31")).toBe(true);
  });

  it("lists occurrences, honouring skips, end date and pause", () => {
    const routine = { ...base, endDate: "2025-09-05", recurrence: { frequency: "daily", interval: 1 } };
    const fromMs = Date.parse("2025-09-02T07:00:00Z"); // 09:00 Rome: today's 08:10 already passed
    const exceptions = new Map([["2025-09-04", "skipped"], ["2025-09-05", "dismissed"]]);
    expect(listOccurrences(routine, { fromMs, timeZone: rome, exceptions })).toEqual([
      { date: "2025-09-03", atMs: Date.parse("2025-09-03T06:10:00Z"), dismissed: false },
      { date: "2025-09-05", atMs: Date.parse("2025-09-05T06:10:00Z"), dismissed: true }
    ]);
    expect(listOccurrences({ ...routine, status: "paused" }, { fromMs, timeZone: rome })).toEqual([]);
    expect(listOccurrences({ ...routine, status: "paused", resumeOn: "2025-09-05" }, { fromMs, timeZone: rome }))
      .toHaveLength(1);
    expect(listOccurrences({ ...routine, status: "cancelled" }, { fromMs, timeZone: rome })).toEqual([]);
  });
});

describe("input normalization", () => {
  it("validates timers", () => {
    expect(normalizeTimerInput({ title: "  Pasta   ready ", durationMs: 600_000 }))
      .toEqual({ title: "Pasta ready", durationMs: 600_000, autoDismissMs: 60_000, style: "disc", icon: null });
    expect(() => normalizeTimerInput({ title: "", durationMs: 600_000 })).toThrow(/title/);
    expect(() => normalizeTimerInput({ title: "x", durationMs: 500 })).toThrow(/durationMs/);
    expect(() => normalizeTimerInput({ title: "x", durationMs: 25 * 3_600_000 })).toThrow(/durationMs/);
    expect(() => normalizeTimerInput({ title: "x", durationMs: 1.5e6 + 0.5 })).toThrow(/durationMs/);
    expect(() => normalizeTimerInput({ title: "x", durationMs: 600_000, secs: 1 })).toThrow(/Unknown field: secs/);
  });

  it("validates recurrences", () => {
    expect(normalizeRecurrence({ frequency: "weekly", weekdays: ["Fri", "mon", "MON"] }))
      .toEqual({ frequency: "weekly", interval: 1, weekdays: ["mon", "fri"] });
    expect(() => normalizeRecurrence({ frequency: "weekly", weekdays: [] })).toThrow(/weekdays/);
    expect(() => normalizeRecurrence({ frequency: "weekly", weekdays: [1] })).toThrow(/weekdays/); // ambiguous
    expect(() => normalizeRecurrence({ frequency: "weekly", weekdays: ["monday"] })).toThrow(/weekdays/);
    expect(() => normalizeRecurrence({ frequency: "daily", weekdays: ["mon"] })).toThrow(/Unknown field/);
    expect(() => normalizeRecurrence({ frequency: "daily", every: 2 })).toThrow(/Unknown field: recurrence.every/);
    expect(() => normalizeRecurrence({ frequency: "monthly" })).toThrow(/monthDay/);
    expect(() => normalizeRecurrence({ frequency: "hourly" })).toThrow(/frequency/);
    expect(() => normalizeRecurrence({ frequency: "monthly", monthDay: 1, interval: 13 })).toThrow(/interval/);
  });

  it("validates routines and defaults the start date to today", () => {
    expect(normalizeRoutineInput({
      title: "School run",
      time: "08:10",
      recurrence: { frequency: "daily" }
    }, { today: "2025-09-12" })).toEqual({
      title: "School run",
      time: "08:10",
      recurrence: { frequency: "daily", interval: 1 },
      startDate: "2025-09-12",
      endDate: null,
      noticeMinutes: 15,
      autoDismissMs: 60_000,
      style: "clock",
      icon: null
    });
    const valid = { title: "x", time: "08:10", recurrence: { frequency: "daily" } };
    expect(() => normalizeRoutineInput({ ...valid, time: "8:10" }, { today: "2025-09-12" })).toThrow(/time/);
    expect(() => normalizeRoutineInput({ ...valid, time: "24:00" }, { today: "2025-09-12" })).toThrow(/time/);
    expect(() => normalizeRoutineInput({ ...valid, startDate: "2025-02-30" }, { today: "2025-09-12" })).toThrow(/startDate/);
    expect(() => normalizeRoutineInput({ ...valid, endDate: "2025-09-01" }, { today: "2025-09-12" })).toThrow(/endDate/);
    expect(() => normalizeRoutineInput({ ...valid, status: "paused" }, { today: "2025-09-12" })).toThrow(/Unknown field: status/);
  });
});
