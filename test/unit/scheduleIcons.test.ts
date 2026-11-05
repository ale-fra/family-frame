import { AlarmClock, Backpack, CircleAlert, CookingPot, Timer } from "lucide-react";
import { describe, expect, it } from "vitest";
import { SCHEDULE_ICON_KEYS } from "../../server/lib/schedule-icons.mjs";
import { SCHEDULE_ICONS, resolveScheduleIcon } from "../../src/frame/lib/scheduleIcons";

describe("schedule icons", () => {
  it("maps exactly the keys the server documents", () => {
    expect(Object.keys(SCHEDULE_ICONS).sort()).toEqual([...SCHEDULE_ICON_KEYS].sort());
  });

  it("resolves known keys", () => {
    expect(resolveScheduleIcon("pot", "timer")).toBe(CookingPot);
    expect(resolveScheduleIcon("backpack", "routine")).toBe(Backpack);
  });

  it("uses a per-kind default when no icon was chosen", () => {
    expect(resolveScheduleIcon(null, "timer")).toBe(Timer);
    expect(resolveScheduleIcon(null, "routine")).toBe(AlarmClock);
  });

  it("shows an exclamation mark for unknown keys", () => {
    expect(resolveScheduleIcon("unicorn", "timer")).toBe(CircleAlert);
  });
});
