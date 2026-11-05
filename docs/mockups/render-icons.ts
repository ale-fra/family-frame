// Runs at build time (Node): renders every icon through the REAL lookup in src/frame/lib/scheduleIcons.ts.
import { Bell, PartyPopper, Pause, Snail, Sun, type LucideIcon } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SCHEDULE_ICONS, resolveScheduleIcon } from "../../src/frame/lib/scheduleIcons";

const svg = (Icon: LucideIcon) => renderToStaticMarkup(createElement(Icon, { size: 24, strokeWidth: 2.2, "aria-hidden": true }));

export function renderIcons() {
  return {
    byKey: Object.fromEntries(Object.keys(SCHEDULE_ICONS).map((key) => [key, svg(resolveScheduleIcon(key, "timer"))])),
    timer: svg(resolveScheduleIcon(null, "timer")),
    routine: svg(resolveScheduleIcon(null, "routine")),
    unknown: svg(resolveScheduleIcon("not-a-known-key", "timer")),
    ui: { Bell: svg(Bell), PartyPopper: svg(PartyPopper), Pause: svg(Pause), Snail: svg(Snail), Sun: svg(Sun) }
  };
}
