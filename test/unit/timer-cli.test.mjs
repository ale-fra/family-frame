import { describe, expect, it } from "vitest";
import { formatCountdown, parseDuration, parseTimerArgs } from "../../server/lib/timer-cli-utils.mjs";

describe("timer command line", () => {
  it.each([
    ["3m", 180_000], ["90s", 90_000], ["1h30m", 5_400_000], ["2m30s", 150_000], ["5", 300_000], ["1H", 3_600_000]
  ])("reads %s as %i ms", (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it.each(["", "abc", "3x", "m", "-3m", "0m", "3m-2s"])("rejects %j", (text) => {
    expect(parseDuration(text)).toBeNull();
  });

  it("formats the countdown like a kitchen timer", () => {
    expect(formatCountdown(161_000)).toBe("2:41");
    expect(formatCountdown(160_001)).toBe("2:41"); // rounds up: never shows 0:00 while time is left
    expect(formatCountdown(5_000)).toBe("0:05");
    expect(formatCountdown(3_723_000)).toBe("1:02:03");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("parses arguments with defaults", () => {
    expect(parseTimerArgs(["3m"])).toEqual({ durationMs: 180_000, title: "Timer", style: undefined, icon: undefined });
    expect(parseTimerArgs(["5m", "Pasta", "--style", "sweets", "--icon", "pot"]))
      .toEqual({ durationMs: 300_000, title: "Pasta", style: "sweets", icon: "pot" });
    for (const args of [[], ["soon"], ["3m", "x", "--style"], ["3m", "x", "--colour", "red"]]) {
      expect(parseTimerArgs(args), args.join(" ")).toBeNull();
    }
  });
});
