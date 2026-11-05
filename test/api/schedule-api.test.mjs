import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFrameServerApp } from "../../server/lib/app.mjs";
import { openApiSpec } from "../../server/lib/openapi.mjs";
import { createScheduleEvents } from "../../server/lib/schedule-events.mjs";
import { createScheduleStore } from "../../server/lib/schedule-store.mjs";
import { createContractValidator } from "../helpers/openapi-contract.mjs";

const PIN = "1234";
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
// Friday 2025-09-12 09:00 in Rome (CEST, UTC+2).
const FRIDAY_9AM = Date.parse("2025-09-12T07:00:00Z");
const at = (ms) => new Date(ms).toISOString();
// Every call made through api() is also checked against the OpenAPI document.
const contract = createContractValidator(openApiSpec);

describe("schedule API", () => {
  let tempDir;
  let store;
  let server;
  let baseUrl;
  let now;
  let scheduleEvents;
  let emitted;

  const advance = (ms) => { now += ms; };

  async function api(method, url, body, { pin = PIN } = {}) {
    const headers = {};
    if (pin) headers["x-frame-admin-pin"] = pin;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(baseUrl + url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const result = { status: response.status, body: text ? JSON.parse(text) : null };
    contract.check({ method, url, requestBody: body, status: result.status, responseBody: result.body });
    return result;
  }

  async function createTimer(overrides = {}) {
    const response = await api("POST", "/api/admin/timers", { title: "Pasta", durationMs: 15 * MINUTE, ...overrides });
    expect(response.status).toBe(201);
    return response.body.timer;
  }

  async function createSchoolRun(overrides = {}) {
    const response = await api("POST", "/api/admin/routines", {
      title: "Take kids to school",
      time: "08:10",
      recurrence: { frequency: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"] },
      ...overrides
    });
    expect(response.status).toBe(201);
    return response.body.routine;
  }

  beforeEach(async () => {
    now = FRIDAY_9AM;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-schedule-api-"));
    store = createScheduleStore({
      dbPath: path.join(tempDir, "settings.sqlite"),
      timeZone: "Europe/Rome",
      timerAutoDismissMs: 60 * SECOND,
      routineAutoDismissMs: 60 * SECOND,
      timerStyle: "disc",
      routineStyle: "clock",
      clock: () => now
    });
    store.ensureSchema();
    scheduleEvents = createScheduleEvents();
    emitted = [];
    scheduleEvents.subscribe((event) => {
      contract.checkWebhook("scheduleEvent", event);
      emitted.push(event);
    });

    const app = createFrameServerApp({
      runtime: { adminPin: PIN, distDir: tempDir, indexPath: path.join(tempDir, "index.html"), photoDir: tempDir, locale: "it-IT" },
      calendarService: {},
      clientLog: {},
      photoStore: {},
      settingsStore: {},
      systemActions: {},
      scheduleStore: store,
      scheduleEvents
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    store.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("admin PIN", () => {
    it.each([
      ["GET", "/api/admin/timers"],
      ["POST", "/api/admin/timers"],
      ["POST", "/api/admin/timers/any/pause"],
      ["GET", "/api/admin/routines"],
      ["PATCH", "/api/admin/routines/any"],
      ["GET", "/api/admin/routines/occurrences"]
    ])("rejects %s %s without the PIN", async (method, url) => {
      expect((await api(method, url, undefined, { pin: "" })).status).toBe(401);
      expect((await api(method, url, undefined, { pin: "wrong" })).status).toBe(401);
    });
  });

  describe("timers", () => {
    it("creates a running timer", async () => {
      const response = await api("POST", "/api/admin/timers", { title: "Pasta is ready", durationMs: 10 * MINUTE });
      expect(response.status).toBe(201);
      expect(response.body.timer).toMatchObject({
        id: expect.any(String),
        title: "Pasta is ready",
        durationMs: 10 * MINUTE,
        status: "running",
        remainingMs: 10 * MINUTE,
        endsAt: at(FRIDAY_9AM + 10 * MINUTE),
        autoDismissMs: 60 * SECOND,
        style: "disc",
        icon: null,
        finishedAt: null,
        dismissAt: null,
        closedAt: null
      });
    });

    it("emits timer.created", async () => {
      const timer = await createTimer({ title: "Eggs", durationMs: 5 * MINUTE });
      expect(emitted).toEqual([{ type: "timer.created", at: at(FRIDAY_9AM), timer }]);
      await api("POST", "/api/admin/timers", { title: "" });
      expect(emitted).toHaveLength(1); // nothing for rejected requests
    });

    describe("style and icon", () => {
      it.each(["disc", "sweets", "journey", "clock"])("accepts style %s", async (style) => {
        expect((await createTimer({ style })).style).toBe(style);
      });

      it("accepts any well-formed icon key; the frame shows ! for keys it does not know", async () => {
        expect((await createTimer({ icon: "pot" })).icon).toBe("pot");
        expect((await createTimer({ icon: "unicorn-2" })).icon).toBe("unicorn-2");
      });

      it.each([
        [{ style: "hourglass" }, /style/],
        [{ style: "DISC" }, /style/],
        [{ icon: "Cooking Pot" }, /icon/],
        [{ icon: "" }, /icon/],
        [{ icon: "x".repeat(41) }, /icon/]
      ])("rejects %j", async (overrides, message) => {
        const response = await api("POST", "/api/admin/timers", { title: "x", durationMs: MINUTE, ...overrides });
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(message);
      });

      it("can be changed or cleared later", async () => {
        const { id } = await createTimer({ icon: "pot" });
        const response = await api("PATCH", `/api/admin/timers/${id}`, { style: "journey", icon: null });
        expect(response.body.timer).toMatchObject({ style: "journey", icon: null });
      });
    });

    describe("parallel limit", () => {
      it("allows at most 3 active timers (running, paused or ringing)", async () => {
        const first = await createTimer({ title: "A", durationMs: MINUTE });
        const second = await createTimer({ title: "B" });
        await createTimer({ title: "C" });
        await api("POST", `/api/admin/timers/${second.id}/pause`);
        advance(MINUTE + SECOND); // A is ringing: still on screen, still counts

        const rejected = await api("POST", "/api/admin/timers", { title: "D", durationMs: MINUTE });
        expect(rejected.status).toBe(409);
        expect(rejected.body).toEqual({ error: expect.stringMatching(/3/), code: "limit-reached" });

        await api("POST", `/api/admin/timers/${first.id}/cancel`);
        expect((await api("POST", "/api/admin/timers", { title: "D", durationMs: MINUTE })).status).toBe(201);
      });

      it("frees the slot when a ringing timer disappears by itself", async () => {
        await createTimer({ title: "A", durationMs: MINUTE });
        await createTimer({ title: "B" });
        await createTimer({ title: "C" });
        advance(2 * MINUTE + SECOND); // A rang for 60 s and was dismissed
        expect((await api("POST", "/api/admin/timers", { title: "D", durationMs: MINUTE })).status).toBe(201);
      });
    });

    it.each([
      [{ durationMs: MINUTE }, /title/],
      [{ title: "x" }, /durationMs/],
      [{ title: "x", durationMs: "600000" }, /durationMs/],
      [{ title: "x", durationMs: 25 * 60 * MINUTE }, /durationMs/],
      [{ title: "x", durationMs: MINUTE, autoDismissMs: -1 }, /autoDismissMs/],
      [{ title: "x", durationMs: MINUTE, duration: 5 }, /Unknown field: duration/],
      [["not", "an", "object"], /object/]
    ])("rejects invalid timer %j", async (payload, message) => {
      const response = await api("POST", "/api/admin/timers", payload);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: expect.stringMatching(message), code: "invalid-input" });
    });

    it("answers malformed or missing bodies with JSON 400s", async () => {
      const malformed = await fetch(`${baseUrl}/api/admin/timers`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frame-admin-pin": PIN },
        body: "{not json"
      });
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toEqual({ error: "Request body is not valid JSON", code: "invalid-input" });

      const missing = await api("POST", "/api/admin/timers");
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe("invalid-input");
    });

    it("lists active timers and fetches a single timer", async () => {
      const first = await createTimer({ title: "A" });
      advance(SECOND);
      const second = await createTimer({ title: "B" });
      advance(4 * MINUTE);

      const list = await api("GET", "/api/admin/timers");
      expect(list.status).toBe(200);
      expect(list.body.timers.map((timer) => [timer.title, timer.remainingMs]))
        .toEqual([["A", 11 * MINUTE - SECOND], ["B", 11 * MINUTE]]);

      expect((await api("GET", `/api/admin/timers/${first.id}`)).body.timer.id).toBe(first.id);
      expect((await api("GET", "/api/admin/timers/missing")).status).toBe(404);
      expect((await api("GET", "/api/admin/timers/missing")).body.code).toBe("not-found");
      expect(second.status).toBe("running");
    });

    it("pauses and resumes", async () => {
      const { id } = await createTimer();
      advance(5 * MINUTE);
      const paused = await api("POST", `/api/admin/timers/${id}/pause`);
      expect(paused.status).toBe(200);
      expect(paused.body.timer).toMatchObject({ status: "paused", remainingMs: 10 * MINUTE, endsAt: null });

      advance(30 * MINUTE);
      const resumed = await api("POST", `/api/admin/timers/${id}/resume`);
      expect(resumed.body.timer).toMatchObject({ status: "running", remainingMs: 10 * MINUTE, endsAt: at(now + 10 * MINUTE) });

      const again = await api("POST", `/api/admin/timers/${id}/resume`);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("invalid-transition");
    });

    describe("changing the duration", () => {
      it("keeps the start time: 'I meant 5 minutes, not 15'", async () => {
        const { id } = await createTimer({ durationMs: 15 * MINUTE });
        advance(2 * MINUTE);
        const response = await api("PATCH", `/api/admin/timers/${id}`, { durationMs: 5 * MINUTE });
        expect(response.status).toBe(200);
        expect(response.body.timer).toMatchObject({
          status: "running",
          durationMs: 5 * MINUTE,
          remainingMs: 3 * MINUTE,
          endsAt: at(FRIDAY_9AM + 5 * MINUTE)
        });
      });

      it("adjusts the frozen remaining time of a paused timer", async () => {
        const { id } = await createTimer({ durationMs: 15 * MINUTE });
        advance(2 * MINUTE);
        await api("POST", `/api/admin/timers/${id}/pause`);
        advance(10 * MINUTE);
        const response = await api("PATCH", `/api/admin/timers/${id}`, { durationMs: 20 * MINUTE });
        expect(response.body.timer).toMatchObject({ status: "paused", durationMs: 20 * MINUTE, remainingMs: 18 * MINUTE });
      });

      it("rings immediately when the new duration has already elapsed", async () => {
        const { id } = await createTimer({ durationMs: 15 * MINUTE });
        advance(7 * MINUTE);
        const response = await api("PATCH", `/api/admin/timers/${id}`, { durationMs: 5 * MINUTE });
        expect(response.body.timer).toMatchObject({
          status: "finished",
          durationMs: 5 * MINUTE,
          remainingMs: 0,
          finishedAt: at(now),
          dismissAt: at(now + 60 * SECOND)
        });
      });

      it("adds time with +1 minute", async () => {
        const { id } = await createTimer({ durationMs: 10 * MINUTE });
        advance(3 * MINUTE);
        const response = await api("POST", `/api/admin/timers/${id}/add-time`, { deltaMs: MINUTE });
        expect(response.status).toBe(200);
        expect(response.body.timer).toMatchObject({
          status: "running",
          durationMs: 11 * MINUTE,
          remainingMs: 8 * MINUTE,
          endsAt: at(FRIDAY_9AM + 11 * MINUTE)
        });
      });

      it("accepts negative deltas", async () => {
        const { id } = await createTimer({ durationMs: 10 * MINUTE });
        const response = await api("POST", `/api/admin/timers/${id}/add-time`, { deltaMs: -2 * MINUTE });
        expect(response.body.timer).toMatchObject({ durationMs: 8 * MINUTE, remainingMs: 8 * MINUTE });
      });

      it("snoozes a ringing timer: +1 minute counts from now", async () => {
        const { id } = await createTimer({ durationMs: 10 * MINUTE });
        advance(10 * MINUTE + 20 * SECOND); // ringing for 20 s
        const response = await api("POST", `/api/admin/timers/${id}/add-time`, { deltaMs: MINUTE });
        expect(response.body.timer).toMatchObject({
          status: "running",
          durationMs: 11 * MINUTE,
          remainingMs: MINUTE,
          endsAt: at(now + MINUTE),
          finishedAt: null,
          dismissAt: null
        });
      });

      it.each([
        [{ deltaMs: 0 }, /deltaMs/],
        [{ deltaMs: 1.5 }, /deltaMs/],
        [{}, /deltaMs/],
        [{ deltaMs: 24 * 60 * MINUTE }, /durationMs/],
        [{ deltaMs: -15 * MINUTE }, /durationMs/]
      ])("rejects add-time %j", async (payload, message) => {
        const { id } = await createTimer({ durationMs: 15 * MINUTE });
        const response = await api("POST", `/api/admin/timers/${id}/add-time`, payload);
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(message);
      });

      it("renames and changes auto-dismiss without touching the countdown", async () => {
        const { id } = await createTimer({ durationMs: 15 * MINUTE });
        advance(MINUTE);
        const response = await api("PATCH", `/api/admin/timers/${id}`, { title: "Spaghetti", autoDismissMs: 0 });
        expect(response.body.timer).toMatchObject({
          title: "Spaghetti",
          autoDismissMs: 0,
          durationMs: 15 * MINUTE,
          remainingMs: 14 * MINUTE
        });
        expect((await api("PATCH", `/api/admin/timers/${id}`, { status: "paused" })).status).toBe(400);
        expect((await api("PATCH", `/api/admin/timers/${id}`, {})).status).toBe(400);
      });

      it("refuses to change closed timers", async () => {
        const { id } = await createTimer();
        await api("POST", `/api/admin/timers/${id}/cancel`);
        expect((await api("PATCH", `/api/admin/timers/${id}`, { durationMs: MINUTE })).status).toBe(409);
        expect((await api("POST", `/api/admin/timers/${id}/add-time`, { deltaMs: MINUTE })).status).toBe(409);
      });
    });

    describe("finishing and disappearing", () => {
      it("rings at the deadline, then disappears after the auto-dismiss delay", async () => {
        const { id } = await createTimer({ durationMs: 10 * MINUTE });
        advance(10 * MINUTE + 30 * SECOND);
        const ringing = await api("GET", "/api/admin/timers");
        expect(ringing.body.timers).toHaveLength(1);
        expect(ringing.body.timers[0]).toMatchObject({
          status: "finished",
          finishedAt: at(FRIDAY_9AM + 10 * MINUTE),
          dismissAt: at(FRIDAY_9AM + 11 * MINUTE)
        });
        expect((await api("POST", `/api/admin/timers/${id}/pause`)).status).toBe(409);

        advance(30 * SECOND);
        expect((await api("GET", "/api/admin/timers")).body.timers).toEqual([]);
        expect((await api("GET", `/api/admin/timers/${id}`)).body.timer).toMatchObject({
          status: "dismissed",
          closedAt: at(FRIDAY_9AM + 11 * MINUTE)
        });
        expect((await api("GET", "/api/admin/timers?includeClosed=true")).body.timers).toHaveLength(1);
      });

      it("disappears immediately if the ringing window passed while nobody looked", async () => {
        const { id } = await createTimer({ durationMs: MINUTE });
        advance(60 * MINUTE);
        expect((await api("GET", `/api/admin/timers/${id}`)).body.timer.status).toBe("dismissed");
      });

      it("rings until cancelled when autoDismissMs is 0", async () => {
        const { id } = await createTimer({ durationMs: MINUTE, autoDismissMs: 0 });
        advance(60 * MINUTE);
        expect((await api("GET", `/api/admin/timers/${id}`)).body.timer).toMatchObject({ status: "finished", dismissAt: null });
      });
    });

    describe("cancel forces disappearance", () => {
      it("cancels running and paused timers", async () => {
        const running = await createTimer({ title: "A" });
        const paused = await createTimer({ title: "B" });
        advance(MINUTE);
        await api("POST", `/api/admin/timers/${paused.id}/pause`);

        const cancelled = await api("POST", `/api/admin/timers/${running.id}/cancel`);
        expect(cancelled.status).toBe(200);
        expect(cancelled.body.timer).toMatchObject({ status: "cancelled", remainingMs: 14 * MINUTE, closedAt: at(now) });
        expect((await api("POST", `/api/admin/timers/${paused.id}/cancel`)).body.timer.status).toBe("cancelled");
        expect((await api("GET", "/api/admin/timers")).body.timers).toEqual([]);
      });

      it("silences a ringing timer", async () => {
        const { id } = await createTimer({ durationMs: MINUTE, autoDismissMs: 0 });
        advance(2 * MINUTE);
        const response = await api("POST", `/api/admin/timers/${id}/cancel`);
        expect(response.status).toBe(200);
        expect(response.body.timer).toMatchObject({ status: "dismissed", closedAt: at(now) });
      });

      it("is idempotent", async () => {
        const { id } = await createTimer();
        const first = await api("POST", `/api/admin/timers/${id}/cancel`);
        advance(MINUTE);
        const second = await api("POST", `/api/admin/timers/${id}/cancel`);
        expect(second.status).toBe(200);
        expect(second.body.timer).toEqual(first.body.timer);
        expect((await api("POST", "/api/admin/timers/missing/cancel")).status).toBe(404);
      });
    });
  });

  describe("routines", () => {
    it("creates the school run with named weekdays", async () => {
      const routine = await createSchoolRun();
      expect(routine).toMatchObject({
        id: expect.any(String),
        title: "Take kids to school",
        time: "08:10",
        timeZone: "Europe/Rome",
        recurrence: { frequency: "weekly", interval: 1, weekdays: ["mon", "tue", "wed", "thu", "fri"] },
        startDate: "2025-09-12",
        endDate: null,
        noticeMinutes: 15,
        status: "active",
        resumeOn: null,
        autoDismissMs: 60 * SECOND,
        style: "clock",
        icon: null,
        exceptions: [],
        nextOccurrence: { date: "2025-09-15", at: "2025-09-15T06:10:00.000Z", dismissed: false }
      });
    });

    it("takes a style and an icon, editable later", async () => {
      const routine = await createSchoolRun({ style: "sweets", icon: "backpack" });
      expect(routine).toMatchObject({ style: "sweets", icon: "backpack" });
      const response = await api("PATCH", `/api/admin/routines/${routine.id}`, { style: "disc" });
      expect(response.body.routine).toMatchObject({ style: "disc", icon: "backpack" });
      expect((await api("PATCH", `/api/admin/routines/${routine.id}`, { style: "spiral" })).status).toBe(400);
    });

    describe("ring window", () => {
      it("keeps an occurrence on screen for autoDismissMs after its time, like a timer", async () => {
        expect((await createSchoolRun({ autoDismissMs: 2 * MINUTE })).autoDismissMs).toBe(2 * MINUTE);
      });

      it("can be edited", async () => {
        const { id } = await createSchoolRun();
        const response = await api("PATCH", `/api/admin/routines/${id}`, { autoDismissMs: 30 * SECOND });
        expect(response.body.routine.autoDismissMs).toBe(30 * SECOND);
      });

      it.each([0, 500, 60 * MINUTE + 1, "60000"])("rejects autoDismissMs %j", async (value) => {
        const response = await api("POST", "/api/admin/routines", {
          title: "x", time: "08:10", recurrence: { frequency: "daily" }, autoDismissMs: value
        });
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/autoDismissMs/);
      });

      it("adds the display window to listed occurrences", async () => {
        await createSchoolRun({ noticeMinutes: 10 });
        const response = await api("GET", "/api/admin/routines/occurrences?to=2025-09-16T00:00:00Z");
        expect(response.body.occurrences[0]).toMatchObject({
          at: "2025-09-15T06:10:00.000Z",
          showFrom: "2025-09-15T06:00:00.000Z",
          dismissAt: "2025-09-15T06:11:00.000Z"
        });
      });
    });

    it("normalizes weekday names to lowercase, Monday-first order", async () => {
      const routine = await createSchoolRun({ recurrence: { frequency: "weekly", weekdays: ["SUN", "Wed", "mon", "mon"] } });
      expect(routine.recurrence.weekdays).toEqual(["mon", "wed", "sun"]);
    });

    it.each([
      [{ recurrence: { frequency: "weekly", weekdays: [1, 2, 3] } }, /weekdays/],
      [{ recurrence: { frequency: "weekly", weekdays: ["monday"] } }, /weekdays/],
      [{ recurrence: { frequency: "weekly", weekdays: [] } }, /weekdays/],
      [{ recurrence: { frequency: "daily", weekdays: ["mon"] } }, /Unknown field: recurrence.weekdays/],
      [{ recurrence: { frequency: "yearly" } }, /frequency/],
      [{ time: "8:10" }, /time/],
      [{ title: "" }, /title/],
      [{ color: "red" }, /Unknown field: color/]
    ])("rejects invalid routine %j", async (overrides, message) => {
      const response = await api("POST", "/api/admin/routines", {
        title: "x",
        time: "08:10",
        recurrence: { frequency: "daily" },
        ...overrides
      });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: expect.stringMatching(message), code: "invalid-input" });
    });

    it("lists, fetches and 404s", async () => {
      const { id } = await createSchoolRun();
      await createSchoolRun({ title: "Bins out", time: "07:00", recurrence: { frequency: "daily" } });
      const list = await api("GET", "/api/admin/routines");
      expect(list.body.routines.map((routine) => routine.title)).toEqual(["Bins out", "Take kids to school"]);
      expect((await api("GET", `/api/admin/routines/${id}`)).body.routine.id).toBe(id);
      expect((await api("GET", "/api/admin/routines/missing")).status).toBe(404);
    });

    describe("editing", () => {
      it("changes the time and keeps everything else", async () => {
        const { id } = await createSchoolRun();
        const response = await api("PATCH", `/api/admin/routines/${id}`, { time: "08:30" });
        expect(response.status).toBe(200);
        expect(response.body.routine).toMatchObject({
          title: "Take kids to school",
          time: "08:30",
          recurrence: { frequency: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"] },
          nextOccurrence: { at: "2025-09-15T06:30:00.000Z" }
        });
      });

      it("replaces the whole recurrence and drops exceptions that no longer match", async () => {
        const { id } = await createSchoolRun();
        await api("PUT", `/api/admin/routines/${id}/exceptions/2025-09-15`, { kind: "skipped" }); // Monday
        await api("PUT", `/api/admin/routines/${id}/exceptions/2025-09-16`, { kind: "skipped" }); // Tuesday

        const response = await api("PATCH", `/api/admin/routines/${id}`, {
          recurrence: { frequency: "weekly", weekdays: ["tue", "thu"] }
        });
        expect(response.body.routine.recurrence).toEqual({ frequency: "weekly", interval: 1, weekdays: ["tue", "thu"] });
        expect(response.body.routine.exceptions).toEqual([{ date: "2025-09-16", kind: "skipped" }]);
        expect(response.body.routine.nextOccurrence.date).toBe("2025-09-18");
      });

      it("switches frequency and clears the end date with null", async () => {
        const { id } = await createSchoolRun({ endDate: "2025-12-31" });
        const response = await api("PATCH", `/api/admin/routines/${id}`, {
          recurrence: { frequency: "monthly", monthDay: 1 },
          endDate: null,
          noticeMinutes: 30
        });
        expect(response.body.routine).toMatchObject({
          recurrence: { frequency: "monthly", interval: 1, monthDay: 1 },
          endDate: null,
          noticeMinutes: 30,
          nextOccurrence: { date: "2025-10-01" }
        });
      });

      it("validates edits atomically", async () => {
        const created = await createSchoolRun();
        for (const patch of [{ time: "25:00" }, { endDate: "2025-01-01" }, { status: "paused" }, {}, { id: "other" }]) {
          expect((await api("PATCH", `/api/admin/routines/${created.id}`, patch)).status).toBe(400);
        }
        expect((await api("GET", `/api/admin/routines/${created.id}`)).body.routine).toEqual(created);
      });

      it("keeps a paused routine paused and refuses to edit cancelled ones", async () => {
        const { id } = await createSchoolRun();
        await api("POST", `/api/admin/routines/${id}/pause`);
        expect((await api("PATCH", `/api/admin/routines/${id}`, { title: "School" })).body.routine.status).toBe("paused");
        await api("POST", `/api/admin/routines/${id}/cancel`);
        expect((await api("PATCH", `/api/admin/routines/${id}`, { title: "School" })).status).toBe(409);
      });
    });

    it("pauses, pauses until a date, resumes and cancels", async () => {
      const { id } = await createSchoolRun();
      const paused = await api("POST", `/api/admin/routines/${id}/pause`);
      expect(paused.body.routine).toMatchObject({ status: "paused", resumeOn: null, nextOccurrence: null });

      const holidays = await api("POST", `/api/admin/routines/${id}/pause`, { resumeOn: "2025-09-17" });
      expect(holidays.body.routine).toMatchObject({ status: "paused", resumeOn: "2025-09-17", nextOccurrence: { date: "2025-09-17" } });
      expect((await api("POST", `/api/admin/routines/${id}/pause`, { resumeOn: "2025-09-01" })).status).toBe(400);
      expect((await api("POST", `/api/admin/routines/${id}/pause`, { until: "2025-09-20" })).status).toBe(400);

      const resumed = await api("POST", `/api/admin/routines/${id}/resume`);
      expect(resumed.body.routine).toMatchObject({ status: "active", nextOccurrence: { date: "2025-09-15" } });
      expect((await api("POST", `/api/admin/routines/${id}/resume`)).status).toBe(409);

      const cancelled = await api("POST", `/api/admin/routines/${id}/cancel`);
      expect(cancelled.body.routine).toMatchObject({ status: "cancelled", nextOccurrence: null });
      expect((await api("GET", "/api/admin/routines")).body.routines).toEqual([]);
      expect((await api("GET", "/api/admin/routines?includeCancelled=true")).body.routines).toHaveLength(1);
      expect((await api("POST", `/api/admin/routines/${id}/cancel`)).status).toBe(200); // idempotent
    });

    it("skips, dismisses and restores single occurrences", async () => {
      const { id } = await createSchoolRun();
      const skipped = await api("PUT", `/api/admin/routines/${id}/exceptions/2025-09-15`, { kind: "skipped" });
      expect(skipped.status).toBe(200);
      expect(skipped.body.routine.nextOccurrence.date).toBe("2025-09-16");

      const dismissed = await api("PUT", `/api/admin/routines/${id}/exceptions/2025-09-15`, { kind: "dismissed" });
      expect(dismissed.body.routine.nextOccurrence).toMatchObject({ date: "2025-09-15", dismissed: true });

      const restored = await api("DELETE", `/api/admin/routines/${id}/exceptions/2025-09-15`);
      expect(restored.body.routine).toMatchObject({ exceptions: [], nextOccurrence: { date: "2025-09-15", dismissed: false } });

      expect((await api("PUT", `/api/admin/routines/${id}/exceptions/2025-09-13`, { kind: "skipped" })).status).toBe(400);
      expect((await api("PUT", `/api/admin/routines/${id}/exceptions/2025-09-15`, { kind: "moved" })).status).toBe(400);
      expect((await api("PUT", `/api/admin/routines/${id}/exceptions/15-09-2025`, { kind: "skipped" })).status).toBe(400);
    });

    it("lists upcoming occurrences in a window", async () => {
      await createSchoolRun();
      await createSchoolRun({ title: "Bins out", time: "21:00", recurrence: { frequency: "weekly", weekdays: ["sun"] } });

      const defaultWindow = await api("GET", "/api/admin/routines/occurrences");
      expect(defaultWindow.status).toBe(200);
      expect(defaultWindow.body).toMatchObject({ from: at(FRIDAY_9AM), to: at(FRIDAY_9AM + 24 * 60 * MINUTE), occurrences: [] });

      const weekend = await api("GET", "/api/admin/routines/occurrences?to=2025-09-16T00:00:00Z");
      expect(weekend.body.occurrences).toEqual([
        expect.objectContaining({ title: "Bins out", date: "2025-09-14", at: "2025-09-14T19:00:00.000Z", noticeMinutes: 15 }),
        expect.objectContaining({ title: "Take kids to school", date: "2025-09-15", at: "2025-09-15T06:10:00.000Z" })
      ]);

      expect((await api("GET", "/api/admin/routines/occurrences?from=yesterday")).status).toBe(400);
      expect((await api("GET", "/api/admin/routines/occurrences?to=2025-09-01T00:00:00Z")).status).toBe(400);
      expect((await api("GET", "/api/admin/routines/occurrences?to=2026-09-01T00:00:00Z")).status).toBe(400);
    });
  });

  describe("public schedule for the frame (GET /api/schedule)", () => {
    const MONDAY_7AM = Date.parse("2025-09-15T05:00:00Z"); // 07:00 in Rome

    it("is readable without the PIN and reports the server time", async () => {
      const response = await api("GET", "/api/schedule", undefined, { pin: "" });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        serverTime: at(FRIDAY_9AM),
        timeZone: "Europe/Rome",
        timers: [],
        routines: []
      });
    });

    it("lists the timers the frame should show: running, paused and ringing", async () => {
      await createTimer({ title: "Running" });
      const paused = await createTimer({ title: "Paused" });
      const cancelled = await createTimer({ title: "Cancelled" });
      await api("POST", `/api/admin/timers/${cancelled.id}/cancel`);
      await createTimer({ title: "Ringing", durationMs: MINUTE });
      await api("POST", `/api/admin/timers/${paused.id}/pause`);
      advance(MINUTE + 10 * SECOND);

      const { body } = await api("GET", "/api/schedule", undefined, { pin: "" });
      expect(body.serverTime).toBe(at(now));
      expect(body.timers.map((timer) => [timer.title, timer.status])).toEqual([
        ["Running", "running"],
        ["Paused", "paused"],
        ["Ringing", "finished"]
      ]);
    });

    it("lists routine occurrences of the next 24 hours with their display window", async () => {
      const routine = await createSchoolRun({ noticeMinutes: 15 });
      expect((await api("GET", "/api/schedule", undefined, { pin: "" })).body.routines).toEqual([]); // Monday is > 24 h away

      now = MONDAY_7AM;
      const upcoming = (await api("GET", "/api/schedule", undefined, { pin: "" })).body.routines;
      expect(upcoming).toEqual([{
        routineId: routine.id,
        title: "Take kids to school",
        date: "2025-09-15",
        at: "2025-09-15T06:10:00.000Z",
        showFrom: "2025-09-15T05:55:00.000Z",
        dismissAt: "2025-09-15T06:11:00.000Z",
        noticeMinutes: 15,
        style: "clock",
        icon: null,
        dismissed: false
      }]);
    });

    it("keeps a due occurrence during its ring window, then drops it", async () => {
      await createSchoolRun();
      now = Date.parse("2025-09-15T06:10:30Z"); // Monday ringing; Tuesday's notice opens within 24 h
      expect((await api("GET", "/api/schedule", undefined, { pin: "" })).body.routines.map((o) => o.date))
        .toEqual(["2025-09-15", "2025-09-16"]);
      now = Date.parse("2025-09-15T06:11:00Z"); // Monday's ring window is over
      expect((await api("GET", "/api/schedule", undefined, { pin: "" })).body.routines.map((o) => o.date))
        .toEqual(["2025-09-16"]);
    });

    it("leaves out skipped, dismissed, paused and cancelled routines", async () => {
      const skipped = await createSchoolRun({ title: "Skipped" });
      const dismissed = await createSchoolRun({ title: "Dismissed" });
      const paused = await createSchoolRun({ title: "Paused" });
      const cancelled = await createSchoolRun({ title: "Cancelled" });
      await createSchoolRun({ title: "Visible" });
      await api("PUT", `/api/admin/routines/${skipped.id}/exceptions/2025-09-15`, { kind: "skipped" });
      await api("PUT", `/api/admin/routines/${dismissed.id}/exceptions/2025-09-15`, { kind: "dismissed" });
      await api("POST", `/api/admin/routines/${paused.id}/pause`);
      await api("POST", `/api/admin/routines/${cancelled.id}/cancel`);

      now = MONDAY_7AM;
      const { body } = await api("GET", "/api/schedule", undefined, { pin: "" });
      expect(body.routines.map((o) => o.title)).toEqual(["Visible"]);
    });

    it("is read-only", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const response = await fetch(`${baseUrl}/api/schedule`, { method });
        expect(response.status, method).toBe(404);
      }
    });
  });

  it("broadcasts timer and routine changes on the frame event stream", async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const events = [];
    const readUntil = async (type) => {
      while (!events.some((event) => event.type === type)) {
        const { value } = await reader.read();
        for (const line of value.split("\n")) {
          if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
        }
      }
      return events.find((event) => event.type === type);
    };
    await readUntil("connected");

    const timer = await createTimer();
    expect((await readUntil("timers")).detail).toMatchObject({ action: "created", timer: { id: timer.id } });
    expect((await readUntil("schedule")).detail).toMatchObject({ type: "timer.created", timer: { id: timer.id } });
    const routine = await createSchoolRun();
    expect((await readUntil("routines")).detail).toMatchObject({ action: "created", routine: { id: routine.id } });
    controller.abort();
  });
});
