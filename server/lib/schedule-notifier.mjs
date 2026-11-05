// Longest sleep between checks. Bounds how late an event can be if the system clock jumps (setTimeout follows a
// monotonic clock, events follow wall-clock time), while keeping an idle frame at ~1 check per minute.
const MAX_SLEEP_MS = 60_000;
// Upper bound of noticeMinutes (24 h): an occurrence can open its notice window up to this far ahead.
const MAX_NOTICE_MS = 24 * 60 * 60 * 1_000;

/**
 * Turns the passage of time into schedule events, for hooks such as webhooks, sounds or lights:
 *
 *   timer.finished    a timer starts ringing                  (at = finishedAt)
 *   routine.upcoming  a routine enters its notice window       (at = showFrom; only if noticeMinutes > 0)
 *   routine.due       a routine reaches its time               (at = at)
 *
 * Once started, it sleeps until the next such moment (at most a minute) and re-plans whenever the store changes,
 * instead of polling every second.
 *
 * Timer events come from the store's persisted running → finished transition, so they fire exactly once,
 * whoever notices the deadline first, and after a restart only if the timer is still ringing.
 * Routine events fire for moments in (previous check, this check]. The first check only sets the baseline,
 * so moments that passed while the server was down are not replayed, and a clock moving backwards
 * never fires anything twice.
 */
export function createScheduleNotifier({ store, dispatch, clock = Date.now, maxSleepMs = MAX_SLEEP_MS, log = console }) {
  let lastCheckMs = null;
  let nextDueMs = null;
  let timeout = null;
  let running = false;
  let unsubscribeChanges = null;

  const safeDispatch = (event) => {
    try {
      dispatch(event);
    } catch (error) {
      log.error("Schedule event listener failed:", error);
    }
  };

  const unsubscribeFinished = store.onTimerFinished((timer) => {
    safeDispatch({ type: "timer.finished", at: timer.finishedAt, timer });
  });

  function sleep(delayMs) {
    if (!running) return;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      try {
        notifier.tick();
      } catch (error) {
        log.error("Schedule notifier check failed:", error);
        sleep(maxSleepMs);
      }
    }, Math.max(0, delayMs));
    timeout.unref?.();
  }

  const notifier = {
    /** Checks now: fires due events, then (when started) sleeps until the next moment. */
    tick() {
      const now = clock();
      store.finalizeExpiredTimers(now);

      const checkFromMs = lastCheckMs !== null && now > lastCheckMs ? lastCheckMs : now;
      const occurrences = store.listUpcomingOccurrences({ fromMs: checkFromMs, toMs: now + MAX_NOTICE_MS }, now);
      const events = [];
      let nextRoutineMs = Infinity;
      for (const occurrence of occurrences) {
        if (occurrence.dismissed) continue;
        const moments = [
          ...(occurrence.noticeMinutes > 0 ? [["routine.upcoming", occurrence.showFrom]] : []),
          ["routine.due", occurrence.at]
        ];
        for (const [type, at] of moments) {
          const atMs = Date.parse(at);
          if (atMs > checkFromMs && atMs <= now) events.push({ type, at, occurrence });
          else if (atMs > now) nextRoutineMs = Math.min(nextRoutineMs, atMs);
        }
      }

      lastCheckMs = Math.max(lastCheckMs ?? now, now);
      nextDueMs = Math.min(nextRoutineMs, store.nextTimerDeadline(now) ?? Infinity);
      events.sort((left, right) => left.at.localeCompare(right.at)).forEach(safeDispatch);
      sleep(Math.min(nextDueMs - clock(), maxSleepMs));
    },

    start() {
      if (running) return;
      running = true;
      // Any change (new timer, pause, edited routine…) can move the next moment: check again right away.
      unsubscribeChanges = store.onChange(() => sleep(0));
      notifier.tick();
    },

    stop() {
      running = false;
      clearTimeout(timeout);
      timeout = null;
      unsubscribeChanges?.();
      unsubscribeChanges = null;
      unsubscribeFinished();
    }
  };

  return notifier;
}
