import crypto from "node:crypto";
import {
  DEFAULT_TIMER_AUTO_DISMISS_MS,
  DEFAULT_TIMER_STYLE,
  MAX_ACTIVE_TIMERS,
  ScheduleError,
  conflict,
  isoOrNull,
  normalizeAutoDismissMs,
  normalizeDeltaMs,
  normalizeDurationMs,
  normalizeObjectPayload,
  normalizeStyle,
  normalizeTimerInput,
  normalizeTimerPatch,
  notFound
} from "./schedule-utils.mjs";

const CLOSED_TIMER_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

/** Persists timer transitions and notifies listeners when an expired timer starts ringing. */
export function createScheduleTimerStore({
  getDb,
  clock,
  changed,
  autoDismissMs = DEFAULT_TIMER_AUTO_DISMISS_MS,
  style = DEFAULT_TIMER_STYLE
}) {
  normalizeStyle(style);
  normalizeAutoDismissMs(autoDismissMs);
  const timerFinishedListeners = new Set();

  /**
   * Applies time-based transitions: running → finished → dismissed. Idempotent.
   * Listeners hear about timers that started ringing, exactly once: the transition is persisted, so it
   * does not matter whether the notifier tick or an API read performs it. Timers whose ring window also
   * passed (e.g. while the server was down) go straight to dismissed without notification.
   */
  function finalizeExpiredTimers(now = clock()) {
    const expiredIds = getDb().prepare("SELECT id FROM timers WHERE status = 'running' AND ends_at <= ?")
      .all(now)
      .map((row) => row.id);
    getDb().prepare(`
      UPDATE timers
      SET status = 'finished', finished_at = ends_at, updated_at = ?
      WHERE status = 'running' AND ends_at <= ?
    `).run(now, now);
    getDb().prepare(`
      UPDATE timers
      SET status = 'dismissed', closed_at = finished_at + auto_dismiss_ms, updated_at = ?
      WHERE status = 'finished' AND auto_dismiss_ms > 0 AND finished_at + auto_dismiss_ms <= ?
    `).run(now, now);
    if (expiredIds.length === 0 || timerFinishedListeners.size === 0) return;

    const select = getDb().prepare("SELECT * FROM timers WHERE id = ?");
    for (const id of expiredIds) {
      const row = select.get(id);
      if (row?.status !== "finished") continue;
      const timer = timerView(row, now);
      for (const listener of timerFinishedListeners) listener(timer);
    }
  }

  /** Earliest deadline of a running timer after `now`, or null. */
  function nextTimerDeadline(now = clock()) {
    const row = getDb().prepare("SELECT min(ends_at) AS next FROM timers WHERE status = 'running' AND ends_at > ?").get(now);
    return row?.next ?? null;
  }

  /** Registers a listener for timers that start ringing. Returns an unsubscribe function. */
  function onTimerFinished(listener) {
    timerFinishedListeners.add(listener);
    return () => timerFinishedListeners.delete(listener);
  }

  function createTimer(payload, now = clock()) {
    const timer = normalizeTimerInput(payload, { defaultAutoDismissMs: autoDismissMs, defaultStyle: style });
    finalizeExpiredTimers(now);
    const { active } = getDb()
      .prepare("SELECT count(*) AS active FROM timers WHERE status IN ('running', 'paused', 'finished')")
      .get();
    if (active >= MAX_ACTIVE_TIMERS) {
      throw new ScheduleError(409, "limit-reached",
        `At most ${MAX_ACTIVE_TIMERS} timers can be active at once; cancel one first`);
    }
    const id = crypto.randomUUID();
    getDb().prepare(`
      INSERT INTO timers (id, title, duration_ms, status, ends_at, auto_dismiss_ms, style, icon, created_at, updated_at)
      VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)
    `).run(id, timer.title, timer.durationMs, now + timer.durationMs, timer.autoDismissMs, timer.style, timer.icon, now, now);
    purgeClosedTimers(now - CLOSED_TIMER_RETENTION_MS);
    changed();
    return getTimer(id, now);
  }

  function getTimer(id, now = clock()) {
    return timerView(readTimerRow(id, now), now);
  }

  /** Visible timers (running, paused, finished/ringing) by default; closed ones on request. */
  function listTimers({ includeClosed = false } = {}, now = clock()) {
    finalizeExpiredTimers(now);
    const rows = getDb().prepare(`
      SELECT * FROM timers
      ${includeClosed ? "" : "WHERE status IN ('running', 'paused', 'finished')"}
      ORDER BY created_at, rowid
    `).all();
    return rows.map((row) => timerView(row, now));
  }

  function pauseTimer(id, now = clock()) {
    const row = readTimerRow(id, now);
    requireTimerStatus(row, ["running"]);
    return writeTimerRow({ ...row, status: "paused", remaining_ms: row.ends_at - now, ends_at: null }, now);
  }

  function resumeTimer(id, now = clock()) {
    const row = readTimerRow(id, now);
    requireTimerStatus(row, ["paused"]);
    return writeTimerRow({ ...row, status: "running", ends_at: now + row.remaining_ms, remaining_ms: null }, now);
  }

  /** Makes the timer disappear, whatever its state. Idempotent. */
  function cancelTimer(id, now = clock()) {
    const row = readTimerRow(id, now);
    if (row.status === "cancelled" || row.status === "dismissed") return timerView(row, now);
    // A ringing timer did finish: record it as dismissed rather than cancelled.
    const status = row.status === "finished" ? "dismissed" : "cancelled";
    return writeTimerRow({ ...row, status, closed_at: now }, now);
  }

  function dismissTimer(id, now = clock()) {
    const row = readTimerRow(id, now);
    requireTimerStatus(row, ["finished"]);
    return writeTimerRow({ ...row, status: "dismissed", closed_at: now }, now);
  }

  /** PATCH: title, autoDismissMs and/or durationMs (the start time stays the same). */
  function updateTimer(id, payload, now = clock()) {
    const patch = normalizeTimerPatch(payload);
    let row = readTimerRow(id, now);
    requireTimerStatus(row, ["running", "paused", "finished"]);
    if (patch.durationMs !== undefined) row = withDuration(row, patch.durationMs, now);
    if (patch.title !== undefined) row = { ...row, title: patch.title };
    if (patch.autoDismissMs !== undefined) row = { ...row, auto_dismiss_ms: patch.autoDismissMs };
    if (patch.style !== undefined) row = { ...row, style: patch.style };
    if (patch.icon !== undefined) row = { ...row, icon: patch.icon };
    return writeTimerRow(row, now);
  }

  /** "+1 minute" (or negative). Same as changing the duration by deltaMs; snoozes a ringing timer. */
  function addTimerTime(id, payload, now = clock()) {
    const deltaMs = normalizeDeltaMs(normalizeObjectPayload(payload, "add-time"));
    const row = readTimerRow(id, now);
    requireTimerStatus(row, ["running", "paused", "finished"]);
    const durationMs = row.duration_ms + deltaMs;
    normalizeDurationMs(durationMs, "resulting durationMs");
    return writeTimerRow(withDuration(row, durationMs, now), now);
  }

  /** Deletes cancelled/dismissed timers closed before `beforeMs`. Returns the deleted count. */
  function purgeClosedTimers(beforeMs) {
    const result = getDb().prepare(`
      DELETE FROM timers WHERE status IN ('cancelled', 'dismissed') AND closed_at < ?
    `).run(beforeMs);
    return Number(result.changes);
  }

  function readTimerRow(id, now) {
    finalizeExpiredTimers(now);
    const row = getDb().prepare("SELECT * FROM timers WHERE id = ?").get(id);
    if (!row) throw notFound("Timer not found");
    return row;
  }

  function writeTimerRow(row, now) {
    getDb().prepare(`
      UPDATE timers SET
        title = ?, duration_ms = ?, status = ?, ends_at = ?, remaining_ms = ?,
        finished_at = ?, closed_at = ?, auto_dismiss_ms = ?, style = ?, icon = ?, updated_at = ?
      WHERE id = ?
    `).run(
      row.title, row.duration_ms, row.status, row.ends_at, row.remaining_ms,
      row.finished_at, row.closed_at, row.auto_dismiss_ms, row.style, row.icon, now, row.id
    );
    changed();
    return getTimer(row.id, now);
  }

  function requireTimerStatus(row, allowed) {
    if (!allowed.includes(row.status)) {
      throw conflict(`Timer is ${row.status}; expected ${allowed.join(" or ")}`);
    }
  }

  return {
    createTimer,
    getTimer,
    listTimers,
    updateTimer,
    addTimerTime,
    pauseTimer,
    resumeTimer,
    cancelTimer,
    dismissTimer,
    finalizeExpiredTimers,
    nextTimerDeadline,
    onTimerFinished,
    purgeClosedTimers
  };
}

/**
 * Changes a timer's total duration while keeping its start: elapsed time is preserved and the
 * deadline moves by the difference. If the new duration has already elapsed, the timer rings now.
 * For a ringing timer, extra time counts from now (snooze).
 */
function withDuration(row, durationMs, now) {
  const deltaMs = durationMs - row.duration_ms;
  const ringNow = { status: "finished", ends_at: now, remaining_ms: null, finished_at: now };

  if (row.status === "running") {
    const endsAt = row.ends_at + deltaMs;
    return { ...row, duration_ms: durationMs, ...(endsAt <= now ? ringNow : { ends_at: endsAt }) };
  }
  if (row.status === "paused") {
    const remainingMs = row.remaining_ms + deltaMs;
    return { ...row, duration_ms: durationMs, ...(remainingMs <= 0 ? ringNow : { remaining_ms: remainingMs }) };
  }
  // finished: only more time than originally set restarts it.
  if (deltaMs <= 0) return { ...row, duration_ms: durationMs };
  return { ...row, duration_ms: durationMs, status: "running", ends_at: now + deltaMs, finished_at: null };
}

function timerView(row, now) {
  let remainingMs = 0;
  if (row.status === "running") remainingMs = Math.max(0, row.ends_at - now);
  if (row.status === "paused") remainingMs = row.remaining_ms;
  if (row.status === "cancelled") remainingMs = row.remaining_ms ?? Math.max(0, row.ends_at - row.closed_at);
  const ringing = row.status === "finished";

  return {
    id: row.id,
    title: row.title,
    durationMs: row.duration_ms,
    status: row.status,
    remainingMs,
    endsAt: row.status === "paused" ? null : isoOrNull(row.ends_at),
    autoDismissMs: row.auto_dismiss_ms,
    style: row.style,
    icon: row.icon,
    finishedAt: isoOrNull(row.finished_at),
    dismissAt: ringing && row.auto_dismiss_ms > 0 ? isoOrNull(row.finished_at + row.auto_dismiss_ms) : null,
    closedAt: isoOrNull(row.closed_at),
    createdAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at)
  };
}
