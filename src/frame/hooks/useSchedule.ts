import * as React from "react";
import { fetchSchedule, subscribeFrameEvents } from "../api";
import { createClockSync } from "../lib/clockSync";
import type { PublicSchedule } from "../lib/scheduleDisplay";

// Server events after which the schedule may have changed. "connected" follows every (re)connection of the event
// stream: anything announced while disconnected was missed, so reload.
const RELOAD_EVENTS = new Set(["timers", "routines", "schedule", "connected"]);
const SAFETY_POLL_MS = 60_000;

/**
 * The timers and routines the frame should show (GET /api/schedule), kept fresh through the frame event stream,
 * plus `serverNow()`: the server's clock, estimated from the responses (see clockSync.ts).
 * Between reloads, phases and countdowns are computed locally from the times in the schedule.
 */
export function useSchedule() {
  const [schedule, setSchedule] = React.useState<PublicSchedule | null>(null);
  const clockSyncRef = React.useRef(createClockSync());

  React.useEffect(() => {
    let cancelled = false;
    let loading = false;
    let reloadRequested = false;

    async function load() {
      if (loading) {
        reloadRequested = true; // a burst of changes becomes one follow-up reload
        return;
      }
      loading = true;
      const result = await fetchSchedule();
      loading = false;
      if (cancelled) return;
      if (result) {
        clockSyncRef.current.addSample(result.sample);
        setSchedule(result.schedule);
      }
      if (reloadRequested) {
        reloadRequested = false;
        void load();
      }
    }

    void load();
    const unsubscribe = subscribeFrameEvents((event) => {
      if (RELOAD_EVENTS.has(event.type)) void load();
    });
    const interval = window.setInterval(() => void load(), SAFETY_POLL_MS);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  const serverNow = React.useCallback(() => clockSyncRef.current.serverNow(performance.now(), Date.now()), []);
  return { schedule, serverNow };
}
