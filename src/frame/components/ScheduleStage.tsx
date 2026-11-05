import * as React from "react";
import { Bell, Pause } from "lucide-react";
import type { FrameI18n } from "@/lib/types";
import { formatTime } from "../lib/formatters";
import { frameMessages, type FrameMessages } from "../lib/i18n";
import {
  buildDisplayItems,
  formatRemaining,
  nextDisplayChangeMs,
  selectVisibleItems,
  type DisplayItem,
  type PublicSchedule
} from "../lib/scheduleDisplay";
import { ScheduleVisual } from "./ScheduleVisuals";

/**
 * Timers and routines, drawn over the whole photo area while at least one is on (ringing first, at most 3).
 * Owns the redraw clock, so only this component re-renders while countdowns run. Tells the parent when it starts
 * or stops covering the photos (to pause the slideshow).
 */
export function ScheduleStage({
  schedule,
  serverNow,
  i18n,
  onActiveChange
}: {
  schedule: PublicSchedule | null;
  serverNow: () => number;
  i18n: FrameI18n;
  onActiveChange: (active: boolean) => void;
}) {
  const nowMs = useDisplayClock(serverNow, schedule);
  const { visible, hiddenCount } = React.useMemo(
    () => selectVisibleItems(schedule ? buildDisplayItems(schedule, nowMs) : []),
    [schedule, nowMs]
  );
  const active = visible.length > 0;

  React.useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);

  if (!active) return null;
  const t = frameMessages(i18n.language);
  const timeZone = schedule?.timeZone ?? i18n.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <section className={`schedule-stage count-${visible.length}`} aria-label={t.scheduleLabel}>
      {visible.map((item) => (
        <ScheduleCard key={item.key} item={item} nowMs={nowMs} t={t} i18n={{ locale: i18n.locale, timeZone }} />
      ))}
      {hiddenCount > 0 ? <div className="schedule-more">{t.more(hiddenCount)}</div> : null}
    </section>
  );
}

function ScheduleCard({ item, nowMs, t, i18n }: { item: DisplayItem; nowMs: number; t: FrameMessages; i18n: Required<Pick<FrameI18n, "locale" | "timeZone">> }) {
  const { value, unit } = formatRemaining(item.remainingMs);
  return (
    <article className={`schedule-card phase-${item.phase} kind-${item.kind}`} data-style={item.style}>
      <ScheduleVisual item={item} nowMs={nowMs} timeZone={i18n.timeZone} />
      <h2 className="schedule-title">{item.title}</h2>
      {item.phase === "ringing" ? (
        <p className="schedule-badge"><Bell aria-hidden="true" /> {item.kind === "routine" ? t.itsTime : t.timeUp}</p>
      ) : item.phase === "paused" ? (
        <p className="schedule-badge"><Pause aria-hidden="true" /> {`${t.paused} · ${value} ${unit}`}</p>
      ) : (
        <p className="schedule-remaining"><b>{value}</b><small>{unit}</small></p>
      )}
      {item.kind === "routine" && item.phase !== "ringing" ? (
        <p className="schedule-meta">{t.dueAt(formatTime(new Date(item.dueAtMs), i18n))}</p>
      ) : null}
    </article>
  );
}

/**
 * The server's time, refreshed whenever a new schedule arrives and at the next moment something on screen changes
 * (see nextDisplayChangeMs): each countdown's whole seconds, appearing, ringing, leaving.
 */
function useDisplayClock(serverNow: () => number, schedule: PublicSchedule | null) {
  const [nowMs, setNowMs] = React.useState(serverNow);

  React.useEffect(() => {
    let timeout = 0;
    const redraw = () => {
      const now = serverNow();
      setNowMs(now);
      timeout = window.setTimeout(redraw, schedule ? nextDisplayChangeMs(schedule, now) : 60_000);
    };
    redraw();
    return () => window.clearTimeout(timeout);
  }, [schedule, serverNow]);

  return nowMs;
}
