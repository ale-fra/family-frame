import { describe, expect, it } from "vitest";
import { buildMockupHtml } from "../../docs/mockups/build.mjs";
import { SCHEDULE_ICON_KEYS } from "../../server/lib/schedule-icons.mjs";

// The design mockup runs the frame's real display rules and icon lookup (bundled with esbuild), so it cannot
// drift from them; this keeps it building as those modules change.
describe("design mockup", () => {
  it("bundles the real display rules and every known icon", async () => {
    const html = await buildMockupHtml();
    expect(html).not.toContain("/*FRAME_SCHEDULE_LIB*/");
    expect(html).toContain("var FrameSchedule");
    for (const name of ["buildDisplayItems", "selectVisibleItems", "formatRemaining", "sweetsLayout"]) {
      expect(html).toContain(name);
    }
    const icons = JSON.parse(html.match(/const ICONS = (\{.*?\});\n/s)[1]);
    expect(Object.keys(icons.byKey).sort()).toEqual([...SCHEDULE_ICON_KEYS].sort());
    for (const svg of [icons.timer, icons.routine, icons.unknown]) expect(svg).toMatch(/^<svg /);
  }, 30_000);
});
