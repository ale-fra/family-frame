import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openApiSpec } from "../../server/lib/openapi.mjs";
import { createScheduleNotifier } from "../../server/lib/schedule-notifier.mjs";
import { createScheduleStore } from "../../server/lib/schedule-store.mjs";
import { createWebhookSink } from "../../server/lib/schedule-webhook.mjs";
import { createContractValidator } from "../helpers/openapi-contract.mjs";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const FRIDAY_9AM = Date.parse("2025-09-12T07:00:00Z"); // 09:00 in Rome
const MONDAY_0805 = Date.parse("2025-09-15T06:05:00Z"); // 08:05 in Rome
const contract = createContractValidator(openApiSpec);

describe("schedule notifier", () => {
  let tempDir;
  let store;
  let events;
  let notifier;
  let now;

  beforeEach(async () => {
    now = FRIDAY_9AM;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-notifier-"));
    store = createScheduleStore({
      dbPath: path.join(tempDir, "settings.sqlite"),
      timeZone: "Europe/Rome",
      clock: () => now
    });
    store.ensureSchema();
    events = [];
    notifier = createScheduleNotifier({
      store,
      dispatch: (event) => {
        contract.checkWebhook("scheduleEvent", event); // every event matches the documented webhook payload
        events.push(event);
      },
      clock: () => now
    });
  });

  afterEach(async () => {
    notifier.stop();
    store.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const tickAt = (ms) => {
    now = ms;
    notifier.tick();
  };

  describe("timers", () => {
    it("emits timer.finished once, when the deadline passes", () => {
      notifier.tick();
      const timer = store.createTimer({ title: "Pasta", durationMs: 10 * MINUTE });
      tickAt(FRIDAY_9AM + 10 * MINUTE - 1);
      expect(events).toEqual([]);

      tickAt(FRIDAY_9AM + 10 * MINUTE);
      expect(events).toEqual([{
        type: "timer.finished",
        at: "2025-09-12T07:10:00.000Z",
        timer: expect.objectContaining({ id: timer.id, title: "Pasta", status: "finished" })
      }]);

      tickAt(FRIDAY_9AM + 10 * MINUTE + 30 * SECOND);
      expect(events).toHaveLength(1);
    });

    it("emits even when an API read noticed the deadline first", () => {
      notifier.tick();
      const timer = store.createTimer({ title: "Pasta", durationMs: MINUTE });
      now = FRIDAY_9AM + MINUTE + SECOND;
      expect(store.getTimer(timer.id).status).toBe("finished");
      expect(events.map((event) => event.type)).toEqual(["timer.finished"]);
      notifier.tick();
      expect(events).toHaveLength(1);
    });

    it("stays silent for timers that finished and were dismissed while the server was down", () => {
      store.createTimer({ title: "Old", durationMs: MINUTE });
      tickAt(FRIDAY_9AM + 60 * MINUTE);
      expect(events).toEqual([]);
    });

    it("emits after a restart if the timer is still ringing", () => {
      store.createTimer({ title: "Pasta", durationMs: MINUTE });
      tickAt(FRIDAY_9AM + MINUTE + 20 * SECOND); // first tick after startup, inside the 60 s ring window
      expect(events.map((event) => event.type)).toEqual(["timer.finished"]);
    });
  });

  describe("routines", () => {
    beforeEach(() => {
      store.createRoutine({
        title: "Take kids to school",
        time: "08:10",
        noticeMinutes: 15,
        recurrence: { frequency: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"] }
      });
    });

    it("emits routine.upcoming when the notice window opens and routine.due at the time", () => {
      tickAt(Date.parse("2025-09-15T05:50:00Z"));
      tickAt(Date.parse("2025-09-15T05:55:00Z"));
      expect(events).toEqual([{
        type: "routine.upcoming",
        at: "2025-09-15T05:55:00.000Z",
        occurrence: expect.objectContaining({ title: "Take kids to school", date: "2025-09-15", at: "2025-09-15T06:10:00.000Z" })
      }]);

      tickAt(Date.parse("2025-09-15T06:09:59Z"));
      tickAt(Date.parse("2025-09-15T06:10:00Z"));
      tickAt(Date.parse("2025-09-15T06:10:01Z"));
      expect(events.map((event) => [event.type, event.at])).toEqual([
        ["routine.upcoming", "2025-09-15T05:55:00.000Z"],
        ["routine.due", "2025-09-15T06:10:00.000Z"]
      ]);
    });

    it("catches up on events between two ticks, e.g. after a slow tick", () => {
      tickAt(Date.parse("2025-09-15T05:00:00Z"));
      tickAt(Date.parse("2025-09-15T06:30:00Z"));
      expect(events.map((event) => event.type)).toEqual(["routine.upcoming", "routine.due"]);
    });

    it("does not replay past events on startup", () => {
      tickAt(MONDAY_0805); // first tick: upcoming (07:55) already happened before startup
      tickAt(MONDAY_0805 + SECOND);
      expect(events).toEqual([]);
    });

    it("ignores the clock going backwards", () => {
      tickAt(Date.parse("2025-09-15T06:11:00Z"));
      tickAt(Date.parse("2025-09-15T05:00:00Z"));
      tickAt(Date.parse("2025-09-15T06:11:00Z"));
      expect(events).toEqual([]);
    });

    it("stays silent for skipped and dismissed occurrences", () => {
      const [routine] = store.listRoutines();
      store.setOccurrenceException(routine.id, "2025-09-15", "skipped");
      store.setOccurrenceException(routine.id, "2025-09-16", "dismissed");
      tickAt(Date.parse("2025-09-15T00:00:00Z"));
      tickAt(Date.parse("2025-09-17T00:00:00Z"));
      expect(events).toEqual([]);
    });

    it("skips routine.upcoming when noticeMinutes is 0", () => {
      const [routine] = store.listRoutines();
      store.updateRoutine(routine.id, { noticeMinutes: 0 });
      tickAt(Date.parse("2025-09-15T05:00:00Z"));
      tickAt(Date.parse("2025-09-15T06:30:00Z"));
      expect(events.map((event) => event.type)).toEqual(["routine.due"]);
    });
  });

  it("keeps running when a listener throws", () => {
    const failing = createScheduleNotifier({
      store,
      dispatch: () => { throw new Error("boom"); },
      clock: () => now,
      log: { error: vi.fn() }
    });
    store.createTimer({ title: "Pasta", durationMs: MINUTE });
    failing.tick();
    now += 2 * MINUTE;
    expect(() => failing.tick()).not.toThrow();
  });

  describe("scheduling: sleeps until the next moment instead of ticking every second", () => {
    let live;
    let liveStore;
    let liveEvents;
    let occurrenceQueries;

    beforeEach(() => {
      vi.useFakeTimers({ now: FRIDAY_9AM, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
      liveStore = createScheduleStore({ dbPath: path.join(tempDir, "live.sqlite"), timeZone: "Europe/Rome", clock: () => Date.now() });
      liveStore.ensureSchema();
      liveEvents = [];
      occurrenceQueries = vi.spyOn(liveStore, "listUpcomingOccurrences");
      live = createScheduleNotifier({
        store: liveStore,
        dispatch: (event) => liveEvents.push({ ...event, firedAt: Date.now() }),
        clock: () => Date.now()
      });
      live.start();
    });

    afterEach(() => {
      live.stop();
      liveStore.close();
      vi.useRealTimers();
    });

    it("fires timer.finished exactly at the deadline, waking about once a minute meanwhile", async () => {
      liveStore.createTimer({ title: "Pasta", durationMs: 10 * MINUTE });
      await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
      expect(liveEvents).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(liveEvents).toEqual([expect.objectContaining({ type: "timer.finished", firedAt: FRIDAY_9AM + 10 * MINUTE })]);
      expect(occurrenceQueries.mock.calls.length).toBeLessThanOrEqual(14); // was 600 with a 1-second tick
    });

    it("wakes up early for a timer created while it sleeps", async () => {
      await vi.advanceTimersByTimeAsync(30 * SECOND); // sleeping: nothing due within the next minute
      liveStore.createTimer({ title: "Eggs", durationMs: 5 * SECOND });
      await vi.advanceTimersByTimeAsync(5 * SECOND);
      expect(liveEvents).toEqual([expect.objectContaining({ type: "timer.finished", firedAt: FRIDAY_9AM + 35 * SECOND })]);
    });

    it("re-plans when a timer is paused, changed or cancelled", async () => {
      const timer = liveStore.createTimer({ title: "Pasta", durationMs: 2 * MINUTE });
      await vi.advanceTimersByTimeAsync(MINUTE);
      liveStore.pauseTimer(timer.id);
      await vi.advanceTimersByTimeAsync(5 * MINUTE);
      expect(liveEvents).toEqual([]);
      liveStore.resumeTimer(timer.id); // one minute left, from now
      liveStore.updateTimer(timer.id, { durationMs: MINUTE + 30 * SECOND }); // 30 s left
      await vi.advanceTimersByTimeAsync(30 * SECOND);
      expect(liveEvents.map((event) => event.firedAt)).toEqual([FRIDAY_9AM + 6 * MINUTE + 30 * SECOND]);
    });

    it("fires routine events at their moments", async () => {
      live.stop();
      vi.setSystemTime(Date.parse("2025-09-15T05:40:00Z")); // Monday 07:40 in Rome
      liveStore.createRoutine({
        title: "School", time: "08:10", noticeMinutes: 15,
        recurrence: { frequency: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"] }
      });
      live = createScheduleNotifier({ store: liveStore, dispatch: (event) => liveEvents.push({ ...event, firedAt: Date.now() }), clock: () => Date.now() });
      live.start();
      await vi.advanceTimersByTimeAsync(31 * MINUTE);
      expect(liveEvents.map((event) => [event.type, new Date(event.firedAt).toISOString()])).toEqual([
        ["routine.upcoming", "2025-09-15T05:55:00.000Z"],
        ["routine.due", "2025-09-15T06:10:00.000Z"]
      ]);
    });

    it("stops cleanly", async () => {
      live.stop();
      const queries = occurrenceQueries.mock.calls.length;
      liveStore.createTimer({ title: "Pasta", durationMs: SECOND });
      await vi.advanceTimersByTimeAsync(60 * MINUTE);
      expect(occurrenceQueries.mock.calls.length).toBe(queries);
      expect(liveEvents).toEqual([]);
    });
  });
});

describe("webhook sink", () => {
  let server;
  let received;
  let respond;

  beforeEach(async () => {
    received = [];
    respond = (response) => response.writeHead(204).end();
    server = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        received.push({ method: request.method, headers: request.headers, body: JSON.parse(body) });
        respond(response);
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const url = () => `http://127.0.0.1:${server.address().port}/hook`;
  const event = { type: "routine.due", at: "2025-09-15T06:10:00.000Z", occurrence: { title: "School" } };

  it("POSTs the event as JSON", async () => {
    const sink = createWebhookSink({ url: url() });
    await expect(sink(event)).resolves.toBe(true);
    expect(received).toEqual([{
      method: "POST",
      headers: expect.objectContaining({ "content-type": "application/json", "user-agent": "family-frame" }),
      body: event
    }]);
    expect(received[0].headers["x-frame-webhook-secret"]).toBeUndefined();
  });

  it("sends the optional shared secret", async () => {
    await createWebhookSink({ url: url(), secret: "s3cret" })(event);
    expect(received[0].headers["x-frame-webhook-secret"]).toBe("s3cret");
  });

  it("logs and swallows HTTP errors, network errors and timeouts", async () => {
    const log = { warn: vi.fn() };
    respond = (response) => response.writeHead(500).end();
    await expect(createWebhookSink({ url: url(), log })(event)).resolves.toBe(false);

    respond = () => {}; // never answers
    await expect(createWebhookSink({ url: url(), log, timeoutMs: 200 })(event)).resolves.toBe(false);

    await expect(createWebhookSink({ url: "http://127.0.0.1:1/none", log })(event)).resolves.toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(3);
  });
});
