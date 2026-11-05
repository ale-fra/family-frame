import { openDatabase } from "./database.mjs";
import { createScheduleRoutineStore } from "./schedule-routine-store.mjs";
import { applyScheduleMigrations } from "./schedule-schema.mjs";
import { createScheduleTimerStore } from "./schedule-timer-store.mjs";

/**
 * Composes the timer and routine stores over one database and clock.
 * Schedule changes from either store wake the same notifier.
 */
export function createScheduleStore({
  dbPath,
  db: providedDb,
  timeZone,
  timerAutoDismissMs,
  routineAutoDismissMs,
  timerStyle,
  routineStyle,
  clock = Date.now
}) {
  const changeListeners = new Set();

  /** Called after every write that changes what is scheduled (not for lazy time-based transitions). */
  function changed() {
    for (const listener of changeListeners) listener();
  }
  // A shared connection (see database.mjs) is used as is and never closed here.
  let db = providedDb || null;
  const ownsDb = !providedDb;

  function getDb() {
    if (!db) db = openDatabase(dbPath);
    return db;
  }

  function ensureSchema() {
    applyScheduleMigrations(getDb());
  }

  function close() {
    if (ownsDb) db?.close();
    db = null;
  }

  /** Registers a listener for any schedule change (e.g. to re-plan the notifier). Returns an unsubscribe function. */
  function onChange(listener) {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  }

  const timers = createScheduleTimerStore({
    getDb, clock, changed, autoDismissMs: timerAutoDismissMs, style: timerStyle
  });
  const routines = createScheduleRoutineStore({
    getDb, clock, changed, timeZone, autoDismissMs: routineAutoDismissMs, style: routineStyle
  });

  /** Read-only snapshot for the frame display (GET /api/schedule). */
  function getPublicSchedule(now = clock()) {
    return {
      serverTime: new Date(now).toISOString(),
      timeZone,
      timers: timers.listTimers({}, now),
      routines: routines.listVisibleOccurrences({}, now)
    };
  }

  return {
    ensureSchema,
    close,
    timeZone,
    now: () => clock(),
    onChange,
    ...timers,
    ...routines,
    getPublicSchedule
  };
}
