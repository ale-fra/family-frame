import crypto from "node:crypto";
import {
  DEFAULT_ROUTINE_AUTO_DISMISS_MS,
  DEFAULT_ROUTINE_STYLE,
  MAX_NOTICE_MINUTES,
  assertKnownFields,
  conflict,
  invalid,
  isValidTimeZone,
  isoOrNull,
  listOccurrences,
  maskToWeekdays,
  nextOccurrence,
  normalizeDateString,
  normalizeObjectPayload,
  normalizeRoutineAutoDismissMs,
  normalizeRoutineInput,
  normalizeRoutinePatch,
  normalizeStyle,
  notFound,
  recurrenceMatchesDate,
  weekdaysToMask,
  zonedDateString
} from "./schedule-utils.mjs";

const PUBLIC_HORIZON_MS = 24 * 60 * 60 * 1_000;
const MAX_NOTICE_MS = MAX_NOTICE_MINUTES * 60_000;

/** Persists routine schedules and exceptions, and expands their occurrences in the frame's time zone. */
export function createScheduleRoutineStore({
  getDb,
  clock,
  changed,
  timeZone,
  autoDismissMs = DEFAULT_ROUTINE_AUTO_DISMISS_MS,
  style = DEFAULT_ROUTINE_STYLE
}) {
  normalizeStyle(style);
  if (!isValidTimeZone(timeZone)) throw new Error(`Invalid schedule time zone: ${timeZone}`);
  normalizeRoutineAutoDismissMs(autoDismissMs);

  function transaction(fn) {
    getDb().exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      getDb().exec("COMMIT");
      return result;
    } catch (error) {
      getDb().exec("ROLLBACK");
      throw error;
    }
  }

  function today(now) {
    return zonedDateString(now, timeZone);
  }

  /** Paused routines whose resume_on date has arrived become active again. Idempotent. */
  function reactivateDueRoutines(now = clock()) {
    getDb().prepare(`
      UPDATE routines SET status = 'active', resume_on = NULL, updated_at = ?
      WHERE status = 'paused' AND resume_on IS NOT NULL AND resume_on <= ?
    `).run(now, today(now));
  }

  function createRoutine(payload, now = clock()) {
    const routine = normalizeRoutineInput(payload, {
      today: today(now),
      defaultAutoDismissMs: autoDismissMs,
      defaultStyle: style
    });
    const id = crypto.randomUUID();
    getDb().prepare(`
      INSERT INTO routines (
        id, title, time_of_day, frequency, repeat_interval, weekdays_mask, month_day,
        start_date, end_date, notice_minutes, auto_dismiss_ms, style, icon, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, ...routineColumns(routine), now, now);
    changed();
    return getRoutine(id, now);
  }

  function getRoutine(id, now = clock()) {
    return routineView(readRoutineRow(id, now), now);
  }

  function listRoutines({ includeCancelled = false } = {}, now = clock()) {
    reactivateDueRoutines(now);
    const rows = getDb().prepare(`
      SELECT * FROM routines
      ${includeCancelled ? "" : "WHERE status <> 'cancelled'"}
      ORDER BY time_of_day, created_at, rowid
    `).all();
    return rows.map((row) => routineView(row, now));
  }

  /**
   * PATCH: any of title, time, recurrence (replaced as a whole), startDate, endDate (null clears),
   * noticeMinutes. Status is unchanged; exceptions on dates the new schedule no longer has are removed.
   */
  function updateRoutine(id, payload, now = clock()) {
    const patch = normalizeRoutinePatch(payload);
    const current = routineFromRow(readRoutineRow(id, now));
    if (current.status === "cancelled") throw conflict("Routine is cancelled");

    const merged = normalizeRoutineInput({
      title: current.title,
      time: current.time,
      recurrence: current.recurrence,
      startDate: current.startDate,
      endDate: current.endDate,
      noticeMinutes: current.noticeMinutes,
      autoDismissMs: current.autoDismissMs,
      style: current.style,
      icon: current.icon,
      ...patch
    }, { today: today(now) });

    transaction(() => {
      getDb().prepare(`
        UPDATE routines SET
          title = ?, time_of_day = ?, frequency = ?, repeat_interval = ?, weekdays_mask = ?, month_day = ?,
          start_date = ?, end_date = ?, notice_minutes = ?, auto_dismiss_ms = ?, style = ?, icon = ?, updated_at = ?
        WHERE id = ?
      `).run(...routineColumns(merged), now, id);

      const staleDates = getDb().prepare("SELECT occurrence_date FROM routine_exceptions WHERE routine_id = ?")
        .all(id)
        .map((row) => row.occurrence_date)
        .filter((date) => !recurrenceMatchesDate(merged, date));
      const remove = getDb().prepare("DELETE FROM routine_exceptions WHERE routine_id = ? AND occurrence_date = ?");
      for (const date of staleDates) remove.run(id, date);
    });
    changed();
    return getRoutine(id, now);
  }

  /**
   * Occurrences of all non-cancelled routines whose time is in (fromMs, toMs], sorted by time.
   * `fromMsFor(routine)` lets callers widen the window per routine (e.g. by its ring window).
   */
  function collectOccurrences({ fromMs, toMs, fromMsFor = () => fromMs }, now) {
    reactivateDueRoutines(now);
    const rows = getDb().prepare("SELECT * FROM routines WHERE status <> 'cancelled' ORDER BY created_at, rowid").all();
    return rows
      .flatMap((row) => {
        const routine = routineFromRow(row);
        const routineFromMs = fromMsFor(routine);
        const exceptions = readExceptions(row.id, zonedDateString(routineFromMs, timeZone));
        return listOccurrences(routine, { fromMs: routineFromMs, toMs, timeZone, exceptions })
          .map((occurrence) => occurrenceView(routine, occurrence));
      })
      .sort((left, right) => left.atMs - right.atMs); // stable: same time keeps creation order
  }

  /** Occurrences whose time is in (fromMs, toMs], sorted by time. Admin API and notifier. */
  function listUpcomingOccurrences({ fromMs, toMs }, now = clock()) {
    return collectOccurrences({ fromMs, toMs }, now).map(publicOccurrence);
  }

  /**
   * What the frame should know about: occurrences still on screen (ring window not over) or becoming
   * visible within the horizon. Dismissed occurrences are left out: they were acknowledged.
   */
  function listVisibleOccurrences({ horizonMs = PUBLIC_HORIZON_MS } = {}, now = clock()) {
    return collectOccurrences({
      fromMs: now,
      toMs: now + horizonMs + MAX_NOTICE_MS,
      fromMsFor: (routine) => now - routine.autoDismissMs
    }, now)
      .filter((occurrence) => !occurrence.dismissed && occurrence.dismissAtMs > now && occurrence.showFromMs <= now + horizonMs)
      .map(publicOccurrence);
  }

  function pauseRoutine(id, payload, now = clock()) {
    const options = normalizeObjectPayload(payload, "pause");
    assertKnownFields(options, ["resumeOn"]);
    let resumeOn = null;
    if (options.resumeOn !== undefined && options.resumeOn !== null) {
      resumeOn = normalizeDateString(options.resumeOn);
      if (!resumeOn) throw invalid("resumeOn must be YYYY-MM-DD");
      if (resumeOn <= today(now)) throw invalid("resumeOn must be a future date");
    }
    const row = readRoutineRow(id, now);
    // Re-pausing a paused routine is allowed so the resume date can be changed.
    requireRoutineStatus(row, ["active", "paused"]);
    getDb().prepare("UPDATE routines SET status = 'paused', resume_on = ?, updated_at = ? WHERE id = ?")
      .run(resumeOn, now, id);
    changed();
    return getRoutine(id, now);
  }

  function resumeRoutine(id, now = clock()) {
    const row = readRoutineRow(id, now);
    requireRoutineStatus(row, ["paused"]);
    getDb().prepare("UPDATE routines SET status = 'active', resume_on = NULL, updated_at = ? WHERE id = ?")
      .run(now, id);
    changed();
    return getRoutine(id, now);
  }

  /** Idempotent. The row is kept (soft delete) for history. */
  function cancelRoutine(id, now = clock()) {
    const row = readRoutineRow(id, now);
    if (row.status === "cancelled") return routineView(row, now);
    getDb().prepare(`
      UPDATE routines SET status = 'cancelled', resume_on = NULL, cancelled_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);
    changed();
    return getRoutine(id, now);
  }

  /** Marks one occurrence (by local date) as skipped or dismissed. Replaces an existing exception. */
  function setOccurrenceException(id, date, payload, now = clock()) {
    const options = typeof payload === "string" ? { kind: payload } : normalizeObjectPayload(payload, "exception");
    assertKnownFields(options, ["kind"]);
    const { kind } = options;
    if (kind !== "skipped" && kind !== "dismissed") throw invalid("kind must be skipped or dismissed");
    const occurrenceDate = requireDate(date);
    const routine = routineFromRow(readRoutineRow(id, now));
    if (routine.status === "cancelled") throw conflict("Routine is cancelled");
    if (!recurrenceMatchesDate(routine, occurrenceDate)) throw invalid("Routine has no occurrence on that date");

    getDb().prepare(`
      INSERT INTO routine_exceptions (routine_id, occurrence_date, kind, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (routine_id, occurrence_date) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at
    `).run(id, occurrenceDate, kind, now);
    touchRoutine(id, now);
    return getRoutine(id, now);
  }

  /** Idempotent. */
  function clearOccurrenceException(id, date, now = clock()) {
    const occurrenceDate = requireDate(date);
    readRoutineRow(id, now);
    getDb().prepare("DELETE FROM routine_exceptions WHERE routine_id = ? AND occurrence_date = ?")
      .run(id, occurrenceDate);
    touchRoutine(id, now);
    return getRoutine(id, now);
  }

  function readRoutineRow(id, now) {
    reactivateDueRoutines(now);
    const row = getDb().prepare("SELECT * FROM routines WHERE id = ?").get(id);
    if (!row) throw notFound("Routine not found");
    return row;
  }

  function requireRoutineStatus(row, allowed) {
    if (!allowed.includes(row.status)) {
      throw conflict(`Routine is ${row.status}; expected ${allowed.join(" or ")}`);
    }
  }

  function touchRoutine(id, now) {
    getDb().prepare("UPDATE routines SET updated_at = ? WHERE id = ?").run(now, id);
    changed();
  }

  function readExceptions(routineId, fromDate) {
    const rows = getDb().prepare(`
      SELECT occurrence_date, kind FROM routine_exceptions
      WHERE routine_id = ? AND occurrence_date >= ?
    `).all(routineId, fromDate);
    return new Map(rows.map((row) => [row.occurrence_date, row.kind]));
  }

  function routineView(row, now) {
    const routine = routineFromRow(row);
    const exceptions = readExceptions(row.id, today(now));
    const next = nextOccurrence(routine, { fromMs: now, timeZone, exceptions });
    return {
      ...routine,
      timeZone,
      exceptions: [...exceptions].map(([date, kind]) => ({ date, kind })).sort((a, b) => a.date.localeCompare(b.date)),
      nextOccurrence: next ? { date: next.date, at: new Date(next.atMs).toISOString(), dismissed: next.dismissed } : null
    };
  }

  return {
    createRoutine,
    getRoutine,
    listRoutines,
    updateRoutine,
    listUpcomingOccurrences,
    listVisibleOccurrences,
    pauseRoutine,
    resumeRoutine,
    cancelRoutine,
    setOccurrenceException,
    clearOccurrenceException
  };
}

function routineColumns(routine) {
  const { recurrence } = routine;
  return [
    routine.title,
    routine.time,
    recurrence.frequency,
    recurrence.interval,
    recurrence.frequency === "weekly" ? weekdaysToMask(recurrence.weekdays) : null,
    recurrence.frequency === "monthly" ? recurrence.monthDay : null,
    routine.startDate,
    routine.endDate,
    routine.noticeMinutes,
    routine.autoDismissMs,
    routine.style,
    routine.icon
  ];
}

function occurrenceView(routine, occurrence) {
  return {
    routineId: routine.id,
    title: routine.title,
    date: occurrence.date,
    atMs: occurrence.atMs,
    showFromMs: occurrence.atMs - routine.noticeMinutes * 60_000,
    dismissAtMs: occurrence.atMs + routine.autoDismissMs,
    noticeMinutes: routine.noticeMinutes,
    style: routine.style,
    icon: routine.icon,
    dismissed: occurrence.dismissed
  };
}

function publicOccurrence(occurrence) {
  return {
    routineId: occurrence.routineId,
    title: occurrence.title,
    date: occurrence.date,
    at: new Date(occurrence.atMs).toISOString(),
    showFrom: new Date(occurrence.showFromMs).toISOString(),
    dismissAt: new Date(occurrence.dismissAtMs).toISOString(),
    noticeMinutes: occurrence.noticeMinutes,
    style: occurrence.style,
    icon: occurrence.icon,
    dismissed: occurrence.dismissed
  };
}

function routineFromRow(row) {
  const recurrence = { frequency: row.frequency, interval: row.repeat_interval };
  if (row.frequency === "weekly") recurrence.weekdays = maskToWeekdays(row.weekdays_mask);
  if (row.frequency === "monthly") recurrence.monthDay = row.month_day;
  return {
    id: row.id,
    title: row.title,
    time: row.time_of_day,
    recurrence,
    startDate: row.start_date,
    endDate: row.end_date,
    noticeMinutes: row.notice_minutes,
    autoDismissMs: row.auto_dismiss_ms,
    style: row.style,
    icon: row.icon,
    status: row.status,
    resumeOn: row.resume_on,
    cancelledAt: isoOrNull(row.cancelled_at),
    createdAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at)
  };
}

function requireDate(value) {
  const date = normalizeDateString(value);
  if (!date) throw invalid("date must be YYYY-MM-DD");
  return date;
}
