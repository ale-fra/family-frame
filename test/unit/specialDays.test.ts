import { describe, expect, it } from "vitest";
import { easterDate, isSpecialDayActive } from "../../src/frame/lib/specialDays";

describe("special day schedules", () => {
  it("matches cross-year date ranges", () => {
    const schedule = {
      type: "dateRange" as const,
      start: { month: 12, day: 31 },
      end: { month: 1, day: 1 }
    };

    expect(isSpecialDayActive(schedule, new Date(2026, 11, 31))).toBe(true);
    expect(isSpecialDayActive(schedule, new Date(2027, 0, 1))).toBe(true);
    expect(isSpecialDayActive(schedule, new Date(2027, 0, 2))).toBe(false);
  });

  it("matches nth weekday schedules", () => {
    expect(isSpecialDayActive(
      { type: "nthWeekday", month: 5, weekday: 0, nth: 2 },
      new Date(2026, 4, 10)
    )).toBe(true);
  });

  it("calculates Easter offsets", () => {
    expect(easterDate(2026)).toEqual(new Date(2026, 3, 5));
    expect(isSpecialDayActive(
      { type: "easterOffset", offsetDays: 0, durationDays: 2 },
      new Date(2026, 3, 6)
    )).toBe(true);
  });
});
