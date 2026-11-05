import { describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_ITEMS,
  buildDisplayItems,
  clockHands,
  nextDisplayChangeMs,
  formatRemaining,
  selectVisibleItems,
  sweetsLayout,
  type PublicSchedule,
  type PublicTimer
} from "../../src/frame/lib/scheduleDisplay";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const T0 = Date.parse("2025-09-15T06:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function timer(overrides: Partial<PublicTimer> = {}): PublicTimer {
  return {
    id: "t1", title: "Pasta", durationMs: 10 * MINUTE, status: "running", remainingMs: 10 * MINUTE,
    endsAt: iso(T0 + 10 * MINUTE), autoDismissMs: 60 * SECOND, style: "disc", icon: "pot",
    finishedAt: null, dismissAt: null, closedAt: null, createdAt: iso(T0), updatedAt: iso(T0),
    ...overrides
  };
}

function schedule(parts: Partial<PublicSchedule>): PublicSchedule {
  return { serverTime: iso(T0), timeZone: "Europe/Rome", timers: [], routines: [], ...parts };
}

const school = {
  routineId: "r1", title: "School", date: "2025-09-15", at: iso(T0 + 10 * MINUTE),
  showFrom: iso(T0 - 5 * MINUTE), dismissAt: iso(T0 + 11 * MINUTE), noticeMinutes: 15,
  style: "clock" as const, icon: "backpack", dismissed: false
};

describe("buildDisplayItems", () => {
  it("counts a running timer down locally from endsAt", () => {
    const [item] = buildDisplayItems(schedule({ timers: [timer()] }), T0 + 2 * MINUTE);
    expect(item).toMatchObject({
      key: "timer:t1", kind: "timer", title: "Pasta", style: "disc", icon: "pot",
      phase: "counting", remainingMs: 8 * MINUTE, totalMs: 10 * MINUTE, fraction: 0.8
    });
  });

  it("marks the last 20 % (at least the last minute) as soon", () => {
    const items = (now: number) => buildDisplayItems(schedule({ timers: [timer()] }), now)[0].phase;
    expect(items(T0 + 7 * MINUTE)).toBe("counting");
    expect(items(T0 + 8 * MINUTE)).toBe("soon");
    const long = timer({ durationMs: 60 * MINUTE, endsAt: iso(T0 + 60 * MINUTE) });
    expect(buildDisplayItems(schedule({ timers: [long] }), T0 + 47 * MINUTE)[0].phase).toBe("counting");
    expect(buildDisplayItems(schedule({ timers: [long] }), T0 + 48 * MINUTE)[0].phase).toBe("soon");
    const short = timer({ durationMs: 2 * MINUTE, endsAt: iso(T0 + 2 * MINUTE) });
    expect(buildDisplayItems(schedule({ timers: [short] }), T0 + 61 * SECOND)[0].phase).toBe("soon");
  });

  it("starts ringing at the deadline without waiting for the server, and disappears after autoDismissMs", () => {
    const data = schedule({ timers: [timer()] });
    expect(buildDisplayItems(data, T0 + 10 * MINUTE)[0]).toMatchObject({ phase: "ringing", remainingMs: 0, fraction: 0 });
    expect(buildDisplayItems(data, T0 + 11 * MINUTE - 1)).toHaveLength(1);
    expect(buildDisplayItems(data, T0 + 11 * MINUTE)).toEqual([]);
  });

  it("keeps ringing timers with autoDismissMs 0 until the server says otherwise", () => {
    const data = schedule({ timers: [timer({ autoDismissMs: 0 })] });
    expect(buildDisplayItems(data, T0 + 60 * MINUTE)[0].phase).toBe("ringing");
  });

  it("uses finishedAt / dismissAt for timers the server already reports as finished", () => {
    const data = schedule({ timers: [timer({ status: "finished", remainingMs: 0, finishedAt: iso(T0), dismissAt: iso(T0 + MINUTE) })] });
    expect(buildDisplayItems(data, T0 + 30 * SECOND)[0]).toMatchObject({ phase: "ringing" });
    expect(buildDisplayItems(data, T0 + MINUTE)).toEqual([]);
  });

  it("freezes paused timers", () => {
    const data = schedule({ timers: [timer({ status: "paused", endsAt: null, remainingMs: 6 * MINUTE })] });
    expect(buildDisplayItems(data, T0 + 99 * MINUTE)[0]).toMatchObject({ phase: "paused", remainingMs: 6 * MINUTE, fraction: 0.6 });
  });

  it("shows routines from showFrom, rings at their time and leaves at dismissAt", () => {
    const data = schedule({ routines: [school] });
    expect(buildDisplayItems(data, T0 - 5 * MINUTE - 1)).toEqual([]);
    expect(buildDisplayItems(data, T0)[0]).toMatchObject({
      key: "routine:r1:2025-09-15", kind: "routine", phase: "counting", remainingMs: 10 * MINUTE,
      totalMs: 15 * MINUTE, style: "clock", icon: "backpack", dueAtMs: T0 + 10 * MINUTE
    });
    expect(buildDisplayItems(data, T0 + 10 * MINUTE)[0].phase).toBe("ringing");
    expect(buildDisplayItems(data, T0 + 11 * MINUTE)).toEqual([]);
  });

  it("rings routines without notice only at their time", () => {
    const instant = { ...school, noticeMinutes: 0, showFrom: school.at };
    expect(buildDisplayItems(schedule({ routines: [instant] }), T0 + 5 * MINUTE)).toEqual([]);
    expect(buildDisplayItems(schedule({ routines: [instant] }), T0 + 10 * MINUTE)[0].phase).toBe("ringing");
  });
});

describe("selectVisibleItems", () => {
  const at = T0 + 5 * MINUTE;
  const data = schedule({
    timers: [
      timer({ id: "paused", status: "paused", endsAt: null, remainingMs: MINUTE }),
      timer({ id: "late", endsAt: iso(T0 + 20 * MINUTE), durationMs: 30 * MINUTE }),
      timer({ id: "ringing", status: "finished", remainingMs: 0, finishedAt: iso(T0 + 4 * MINUTE), dismissAt: iso(T0 + 9 * MINUTE) })
    ],
    routines: [school]
  });

  it("shows at most 3 items: ringing first, then the soonest, paused last", () => {
    const { visible, hiddenCount } = selectVisibleItems(buildDisplayItems(data, at));
    expect(MAX_VISIBLE_ITEMS).toBe(3);
    expect(visible.map((item) => item.key)).toEqual(["timer:ringing", "routine:r1:2025-09-15", "timer:late"]);
    expect(hiddenCount).toBe(1);
  });

  it("shows everything when there is room", () => {
    const { visible, hiddenCount } = selectVisibleItems(buildDisplayItems(data, at), 10);
    expect(visible.map((item) => item.key).at(-1)).toBe("timer:paused");
    expect(hiddenCount).toBe(0);
  });
});

describe("formatRemaining", () => {
  it.each([
    [10 * MINUTE, { value: "10", unit: "min" }],
    [9 * MINUTE + 30 * SECOND, { value: "10", unit: "min" }], // rounds up: never "0 min" while time is left
    [61 * SECOND, { value: "2", unit: "min" }],
    [60 * SECOND, { value: "1", unit: "min" }],
    [59 * SECOND, { value: "59", unit: "s" }], // seconds in the last minute
    [500, { value: "1", unit: "s" }],
    [0, { value: "0", unit: "s" }],
    [-5 * SECOND, { value: "0", unit: "s" }],
    [80 * MINUTE, { value: "1:20", unit: "h" }],
    [60 * MINUTE, { value: "60", unit: "min" }],
    [24 * 60 * MINUTE, { value: "24:00", unit: "h" }]
  ])("%i ms → %j", (ms, expected) => {
    expect(formatRemaining(ms)).toEqual(expected);
  });
});

describe("sweetsLayout", () => {
  it("uses one block per minute up to 12 minutes", () => {
    expect(sweetsLayout(10 * MINUTE, 7.5 * MINUTE)).toEqual({
      unitMs: MINUTE, fills: [1, 1, 1, 1, 1, 1, 1, 0.5, 0, 0]
    });
  });

  it("uses 10-second blocks for timers of up to 2 minutes, so short timers are not a single sweet", () => {
    expect(sweetsLayout(50 * SECOND, 35 * SECOND)).toEqual({ unitMs: 10 * SECOND, fills: [1, 1, 1, 0.5, 0] });
    expect(sweetsLayout(2 * MINUTE, 2 * MINUTE).fills).toHaveLength(12);
    expect(sweetsLayout(3 * MINUTE, 0).unitMs).toBe(MINUTE);
  });

  it("groups minutes so there are never more than 12 blocks", () => {
    expect(sweetsLayout(25 * MINUTE, 25 * MINUTE)).toEqual({ unitMs: 5 * MINUTE, fills: [1, 1, 1, 1, 1] });
    expect(sweetsLayout(90 * MINUTE, 0).unitMs).toBe(10 * MINUTE);
    expect(sweetsLayout(24 * 60 * MINUTE, 0).fills).toHaveLength(12);
  });
});

describe("clockHands", () => {
  // 2025-12-04 07:02:00 UTC = 08:02 in Rome.
  const now = Date.parse("2025-12-04T07:02:00Z");

  it("shows the time in the frame's time zone", () => {
    const hands = clockHands(now, now + 8 * MINUTE, "Europe/Rome");
    expect(hands.hourDeg).toBeCloseTo((8 + 2 / 60) * 30);
    expect(hands.minuteDeg).toBeCloseTo(2 * 6);
    expect(clockHands(now, now, "America/New_York").hourDeg).toBeCloseTo((2 + 2 / 60) * 30);
  });

  it("draws the zone from the minute hand to the due time", () => {
    expect(clockHands(now, now + 8 * MINUTE, "Europe/Rome")).toMatchObject({ zoneStartDeg: 12, zoneSweepDeg: 48 });
    expect(clockHands(now, now - SECOND, "Europe/Rome").zoneSweepDeg).toBe(0);
    expect(clockHands(now, now + 3 * 60 * MINUTE, "Europe/Rome").zoneSweepDeg).toBeLessThan(360);
    expect(clockHands(now, now + 3 * 60 * MINUTE, "Europe/Rome").zoneSweepDeg).toBeGreaterThan(359);
  });
});

describe("nextDisplayChangeMs: when the frame must redraw next", () => {
  it("follows each countdown's own seconds, so ringing starts exactly at the deadline", () => {
    const data = schedule({ timers: [timer({ endsAt: iso(T0 + 2_040) })] });
    expect(nextDisplayChangeMs(data, T0)).toBe(40); // 2.04 s left → "3 s" becomes "2 s" in 40 ms
    expect(nextDisplayChangeMs(data, T0 + 1_040)).toBe(1_000);
    expect(nextDisplayChangeMs(data, T0 + 2_040 - 1)).toBe(1);
  });

  it("wakes up when a ringing timer leaves the screen", () => {
    const ringing = timer({ status: "finished", remainingMs: 0, endsAt: iso(T0 - 1_000), finishedAt: iso(T0 - 1_000), dismissAt: iso(T0 + 59_000) });
    expect(nextDisplayChangeMs(schedule({ timers: [ringing] }), T0)).toBe(59_000);
  });

  it("wakes up when a routine appears, rings and leaves", () => {
    const data = schedule({ routines: [school] }); // showFrom T0-5min, at T0+10min, dismissAt T0+11min
    expect(nextDisplayChangeMs(data, T0 - 6 * MINUTE)).toBe(MINUTE);
    expect(nextDisplayChangeMs(data, T0 + 10 * MINUTE - 300)).toBe(300);
    expect(nextDisplayChangeMs(data, T0 + 10 * MINUTE + 500)).toBe(MINUTE - 500);
  });

  it("takes the soonest change across items and sleeps at most a minute", () => {
    const data = schedule({ timers: [timer({ endsAt: iso(T0 + 2_700) }), timer({ id: "t2", endsAt: iso(T0 + 5_100) })] });
    expect(nextDisplayChangeMs(data, T0)).toBe(100);
    expect(nextDisplayChangeMs(schedule({}), T0)).toBe(MINUTE);
    expect(nextDisplayChangeMs(schedule({ timers: [timer({ status: "paused", endsAt: null, remainingMs: MINUTE })] }), T0)).toBe(MINUTE);
  });
});
