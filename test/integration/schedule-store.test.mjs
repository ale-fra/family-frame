import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyScheduleMigrations, scheduleMigrations } from "../../server/lib/schedule-schema.mjs";
import { createScheduleStore } from "../../server/lib/schedule-store.mjs";
import { createSettingsStore } from "../../server/lib/settings-store.mjs";

const MINUTE = 60_000;
// Friday 2025-09-12 09:00 in Rome (CEST, UTC+2).
const FRIDAY_9AM = Date.parse("2025-09-12T07:00:00Z");

describe("schedule store", () => {
  let tempDir;
  let dbPath;
  let store;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-schedule-"));
    dbPath = path.join(tempDir, "settings.sqlite");
    store = createScheduleStore({ dbPath, timeZone: "Europe/Rome", clock: () => FRIDAY_9AM });
    store.ensureSchema();
  });

  afterEach(async () => {
    store.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("schema", () => {
    it("migrates idempotently next to the existing settings table", async () => {
      const settingsStore = createSettingsStore({ settingsDbPath: dbPath, legacySettingsPath: path.join(tempDir, "none") });
      await settingsStore.ensureSettingsDb();
      store.ensureSchema();

      const db = new DatabaseSync(dbPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
        .map((row) => row.name);
      expect(tables).toEqual(["routine_exceptions", "routines", "schema_migrations", "settings", "timers"]);
      expect(db.prepare("SELECT scope, id FROM schema_migrations").all())
        .toEqual(scheduleMigrations.map(({ id }) => ({ scope: "schedule", id })));
      db.close();
    });

    it("rejects rows that violate the state invariants", () => {
      const db = new DatabaseSync(dbPath);
      const insertTimer = db.prepare(`
        INSERT INTO timers (id, title, duration_ms, status, ends_at, remaining_ms, created_at, updated_at)
        VALUES (?, 'x', 60000, ?, ?, ?, 0, 0)
      `);
      expect(() => insertTimer.run("a", "running", null, null)).toThrow(/CHECK/);
      expect(() => insertTimer.run("b", "paused", null, null)).toThrow(/CHECK/);
      expect(() => insertTimer.run("c", "paused", 5, 1000)).toThrow(/CHECK/);
      expect(() => insertTimer.run("d", "finished", 5, null)).toThrow(/CHECK/);
      expect(() => insertTimer.run("e", "ringing", 5, null)).toThrow(/CHECK/);
      expect(() => insertTimer.run("f", "running", "soon", null)).toThrow(/cannot store TEXT/); // STRICT typing

      const insertRoutine = db.prepare(`
        INSERT INTO routines (id, title, time_of_day, frequency, weekdays_mask, month_day, start_date, status, created_at, updated_at)
        VALUES (?, 'x', ?, ?, ?, ?, '2025-09-01', 'active', 0, 0)
      `);
      expect(() => insertRoutine.run("a", "08:10", "weekly", null, null)).toThrow(/CHECK/);
      expect(() => insertRoutine.run("b", "08:10", "daily", 62, null)).toThrow(/CHECK/);
      expect(() => insertRoutine.run("c", "08:10", "monthly", null, 32)).toThrow(/CHECK/);
      expect(() => insertRoutine.run("d", "24:00", "daily", null, null)).toThrow(/CHECK/);
      expect(() => insertRoutine.run("e", "8:10", "daily", null, null)).toThrow(/CHECK/);
      insertRoutine.run("ok", "08:10", "weekly", 62, null);
      db.close();
    });

    it("deletes a routine's exceptions with the routine", () => {
      const routine = store.createRoutine(schoolRun());
      store.setOccurrenceException(routine.id, "2025-09-15", "skipped");
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA foreign_keys = ON");
      db.prepare("DELETE FROM routines WHERE id = ?").run(routine.id);
      expect(db.prepare("SELECT count(*) AS n FROM routine_exceptions").get().n).toBe(0);
      db.close();
    });
  });

  describe("change notifications", () => {
    it("tells listeners about every change, so the notifier can re-plan", () => {
      const changes = [];
      const unsubscribe = store.onChange(() => changes.push(changes.length + 1));
      const timer = store.createTimer({ title: "Pasta", durationMs: 10 * MINUTE });
      store.pauseTimer(timer.id);
      store.resumeTimer(timer.id);
      store.addTimerTime(timer.id, { deltaMs: MINUTE });
      store.cancelTimer(timer.id);
      const routine = store.createRoutine(schoolRun());
      store.updateRoutine(routine.id, { time: "08:20" });
      store.setOccurrenceException(routine.id, "2025-09-15", "skipped");
      store.clearOccurrenceException(routine.id, "2025-09-15");
      store.pauseRoutine(routine.id);
      store.resumeRoutine(routine.id);
      store.cancelRoutine(routine.id);
      expect(changes).toHaveLength(12);

      store.getTimer(timer.id); // reads are not changes
      store.listRoutines();
      unsubscribe();
      store.createTimer({ title: "Eggs", durationMs: MINUTE });
      expect(changes).toHaveLength(12);
    });
  });

  describe("upgrade", () => {
    it("adds auto-dismiss to timers created before migration 2", async () => {
      const legacyPath = path.join(tempDir, "legacy.sqlite");
      const legacy = new DatabaseSync(legacyPath);
      applyScheduleMigrations(legacy, { upTo: 1 });
      legacy.prepare(`
        INSERT INTO timers (id, title, duration_ms, status, ends_at, created_at, updated_at)
        VALUES ('old', 'Old timer', 600000, 'running', ?, ?, ?)
      `).run(FRIDAY_9AM + 10 * MINUTE, FRIDAY_9AM, FRIDAY_9AM);
      legacy.close();

      const upgraded = createScheduleStore({ dbPath: legacyPath, timeZone: "Europe/Rome", clock: () => FRIDAY_9AM });
      upgraded.ensureSchema();
      expect(upgraded.getTimer("old")).toMatchObject({ title: "Old timer", remainingMs: 10 * MINUTE, autoDismissMs: 60_000 });
      upgraded.close();
    });
  });

  describe("timers", () => {
    it("creates a running timer with an absolute deadline", () => {
      const timer = store.createTimer({ title: "Pasta is ready", durationMs: 10 * MINUTE });
      expect(timer).toMatchObject({
        title: "Pasta is ready",
        durationMs: 10 * MINUTE,
        status: "running",
        remainingMs: 10 * MINUTE,
        endsAt: "2025-09-12T07:10:00.000Z",
        finishedAt: null,
        closedAt: null
      });
      expect(store.getTimer(timer.id, FRIDAY_9AM + 4 * MINUTE).remainingMs).toBe(6 * MINUTE);
    });

    it("freezes remaining time while paused and shifts the deadline on resume", () => {
      const { id } = store.createTimer({ title: "Pasta", durationMs: 10 * MINUTE });
      const paused = store.pauseTimer(id, FRIDAY_9AM + 3 * MINUTE);
      expect(paused).toMatchObject({ status: "paused", remainingMs: 7 * MINUTE, endsAt: null });
      expect(store.getTimer(id, FRIDAY_9AM + 60 * MINUTE).remainingMs).toBe(7 * MINUTE);

      const resumed = store.resumeTimer(id, FRIDAY_9AM + 20 * MINUTE);
      expect(resumed).toMatchObject({ status: "running", remainingMs: 7 * MINUTE, endsAt: "2025-09-12T07:27:00.000Z" });
    });

    it("finishes at the deadline without a background job, then auto-dismisses", () => {
      const { id } = store.createTimer({ title: "Pasta", durationMs: 10 * MINUTE });
      const ringing = FRIDAY_9AM + 10 * MINUTE + 30_000;
      const finished = store.getTimer(id, ringing);
      expect(finished).toMatchObject({
        status: "finished",
        remainingMs: 0,
        finishedAt: "2025-09-12T07:10:00.000Z",
        dismissAt: "2025-09-12T07:11:00.000Z"
      });
      expect(store.listTimers({}, ringing).map((t) => t.id)).toEqual([id]);
      expect(() => store.pauseTimer(id, ringing)).toThrow(expect.objectContaining({ statusCode: 409 }));

      expect(store.getTimer(id, FRIDAY_9AM + 11 * MINUTE))
        .toMatchObject({ status: "dismissed", closedAt: "2025-09-12T07:11:00.000Z" });
      expect(store.listTimers({}, FRIDAY_9AM + 11 * MINUTE)).toEqual([]);
      expect(store.listTimers({ includeClosed: true }, FRIDAY_9AM + 11 * MINUTE)).toHaveLength(1);
    });

    it("uses the store-wide auto-dismiss default", () => {
      store.close();
      store = createScheduleStore({ dbPath, timeZone: "Europe/Rome", timerAutoDismissMs: 5_000, clock: () => FRIDAY_9AM });
      expect(store.createTimer({ title: "Eggs", durationMs: MINUTE }).autoDismissMs).toBe(5_000);
    });

    it("cancels running or paused timers, keeping the remaining time for history", () => {
      const running = store.createTimer({ title: "A", durationMs: 10 * MINUTE });
      expect(store.cancelTimer(running.id, FRIDAY_9AM + 4 * MINUTE))
        .toMatchObject({ status: "cancelled", remainingMs: 6 * MINUTE });
      expect(store.cancelTimer(running.id, FRIDAY_9AM + 9 * MINUTE).closedAt).toBe("2025-09-12T07:04:00.000Z"); // idempotent
      expect(() => store.resumeTimer(running.id)).toThrow(expect.objectContaining({ statusCode: 409 }));

      const paused = store.createTimer({ title: "B", durationMs: 10 * MINUTE });
      store.pauseTimer(paused.id, FRIDAY_9AM + MINUTE);
      expect(store.cancelTimer(paused.id, FRIDAY_9AM + 5 * MINUTE))
        .toMatchObject({ status: "cancelled", remainingMs: 9 * MINUTE });
    });

    it("reports validation and missing timers with HTTP-friendly status codes", () => {
      expect(() => store.createTimer({ title: " ", durationMs: MINUTE })).toThrow(expect.objectContaining({ statusCode: 400 }));
      expect(() => store.getTimer("missing")).toThrow(expect.objectContaining({ statusCode: 404 }));
      expect(() => store.pauseTimer("missing")).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it("persists across store instances and purges old closed timers", () => {
      const kept = store.createTimer({ title: "Kept", durationMs: 10 * MINUTE });
      const old = store.createTimer({ title: "Old", durationMs: 10 * MINUTE });
      store.cancelTimer(old.id, FRIDAY_9AM + MINUTE);
      store.close();

      store = createScheduleStore({ dbPath, timeZone: "Europe/Rome", clock: () => FRIDAY_9AM });
      store.ensureSchema();
      expect(store.getTimer(kept.id, FRIDAY_9AM + 2 * MINUTE).remainingMs).toBe(8 * MINUTE);
      expect(store.purgeClosedTimers(FRIDAY_9AM + 2 * MINUTE)).toBe(1);
      expect(store.listTimers({ includeClosed: true }).map((t) => t.title)).toEqual(["Kept"]);
    });
  });

  describe("routines", () => {
    it("stores the school-run example and computes the next weekday occurrence", () => {
      const routine = store.createRoutine(schoolRun());
      expect(routine).toMatchObject({
        title: "Take kids to school",
        time: "08:10",
        recurrence: { frequency: "weekly", interval: 1, weekdays: ["mon", "tue", "wed", "thu", "fri"] },
        startDate: "2025-09-12",
        endDate: null,
        noticeMinutes: 15,
        status: "active",
        resumeOn: null,
        timeZone: "Europe/Rome",
        // Friday 09:00 → Friday's run is over, weekend skipped → Monday 08:10 CEST.
        nextOccurrence: { date: "2025-09-15", at: "2025-09-15T06:10:00.000Z", dismissed: false }
      });
      const db = new DatabaseSync(dbPath);
      expect(db.prepare("SELECT weekdays_mask FROM routines").get().weekdays_mask).toBe(62);
      db.close();
    });

    it("keeps the wall-clock time across DST changes", () => {
      const routine = store.createRoutine(schoolRun());
      expect(store.getRoutine(routine.id, Date.parse("2025-10-31T12:00:00Z")).nextOccurrence.at)
        .toBe("2025-11-03T07:10:00.000Z"); // CET, UTC+1
    });

    it("skips a single occurrence and can undo it", () => {
      const { id } = store.createRoutine(schoolRun());
      const skipped = store.setOccurrenceException(id, "2025-09-15", "skipped");
      expect(skipped.nextOccurrence.date).toBe("2025-09-16");
      expect(skipped.exceptions).toEqual([{ date: "2025-09-15", kind: "skipped" }]);

      expect(store.clearOccurrenceException(id, "2025-09-15").nextOccurrence.date).toBe("2025-09-15");
      expect(() => store.setOccurrenceException(id, "2025-09-13", "skipped")) // Saturday
        .toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it("flags dismissed occurrences without hiding them", () => {
      const { id } = store.createRoutine(schoolRun());
      store.setOccurrenceException(id, "2025-09-15", "dismissed");
      expect(store.getRoutine(id).nextOccurrence).toMatchObject({ date: "2025-09-15", dismissed: true });
    });

    it("pauses indefinitely and resumes", () => {
      const { id } = store.createRoutine(schoolRun());
      expect(store.pauseRoutine(id)).toMatchObject({ status: "paused", resumeOn: null, nextOccurrence: null });
      expect(() => store.resumeRoutine(id, FRIDAY_9AM)).not.toThrow();
      expect(store.getRoutine(id)).toMatchObject({ status: "active", nextOccurrence: { date: "2025-09-15" } });
      expect(() => store.resumeRoutine(id)).toThrow(expect.objectContaining({ statusCode: 409 }));
    });

    it("pauses until a date and reactivates automatically on that date", () => {
      const { id } = store.createRoutine(schoolRun());
      const paused = store.pauseRoutine(id, { resumeOn: "2025-09-17" });
      expect(paused).toMatchObject({ status: "paused", resumeOn: "2025-09-17", nextOccurrence: { date: "2025-09-17" } });

      expect(store.getRoutine(id, Date.parse("2025-09-16T12:00:00Z")).status).toBe("paused");
      expect(store.getRoutine(id, Date.parse("2025-09-16T22:30:00Z"))) // 00:30 on the 17th in Rome
        .toMatchObject({ status: "active", resumeOn: null });

      expect(() => store.pauseRoutine(id, { resumeOn: "2025-09-12" })).toThrow(expect.objectContaining({ statusCode: 400 }));
    });

    it("cancels routines, hiding them from default listings", () => {
      const { id } = store.createRoutine(schoolRun());
      expect(store.cancelRoutine(id)).toMatchObject({ status: "cancelled", nextOccurrence: null });
      expect(store.listRoutines()).toEqual([]);
      expect(store.listRoutines({ includeCancelled: true })).toHaveLength(1);
      expect(() => store.pauseRoutine(id)).toThrow(expect.objectContaining({ statusCode: 409 }));
      expect(() => store.updateRoutine(id, { title: "x" })).toThrow(expect.objectContaining({ statusCode: 409 }));
      expect(() => store.setOccurrenceException(id, "2025-09-15", "skipped"))
        .toThrow(expect.objectContaining({ statusCode: 409 }));
    });

    it("lists upcoming occurrences across routines for the frame", () => {
      store.createRoutine(schoolRun());
      store.createRoutine({ title: "Bins out", time: "21:00", recurrence: { frequency: "weekly", weekdays: ["sun"] } });
      const upcoming = store.listUpcomingOccurrences({
        fromMs: FRIDAY_9AM,
        toMs: Date.parse("2025-09-16T00:00:00Z")
      });
      expect(upcoming.map(({ title, at }) => [title, at])).toEqual([
        ["Bins out", "2025-09-14T19:00:00.000Z"],
        ["Take kids to school", "2025-09-15T06:10:00.000Z"]
      ]);
    });
  });
});

function schoolRun() {
  return {
    title: "Take kids to school",
    time: "08:10",
    recurrence: { frequency: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"] }
  };
}
