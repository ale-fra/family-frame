import express from "express";
import { ScheduleError } from "./schedule-utils.mjs";

const DAY_MS = 86_400_000;
const DEFAULT_OCCURRENCE_WINDOW_MS = DAY_MS;
const MAX_OCCURRENCE_WINDOW_MS = 31 * DAY_MS;

/**
 * REST API for one-off timers, mounted at /api/admin/timers behind the admin PIN.
 * Every mutation returns { timer } and broadcasts a "timers" frame event.
 */
export function createTimersRouter(scheduleStore, emit, scheduleEvents = null) {
  const router = express.Router();

  const mutation = (action, run) => (request, response) => {
    const timer = run(request);
    emit("timers", { action, timer });
    response.status(action === "created" ? 201 : 200).json({ timer });
  };

  router.get("/", (request, response) => {
    response.json({ timers: scheduleStore.listTimers({ includeClosed: request.query.includeClosed === "true" }) });
  });
  router.post("/", mutation("created", (request) => {
    const timer = scheduleStore.createTimer(request.body);
    scheduleEvents?.emit({ type: "timer.created", at: timer.createdAt, timer });
    return timer;
  }));
  router.get("/:id", (request, response) => {
    response.json({ timer: scheduleStore.getTimer(request.params.id) });
  });
  router.patch("/:id", mutation("updated", (request) => scheduleStore.updateTimer(request.params.id, request.body)));
  router.post("/:id/add-time", mutation("updated", (request) => scheduleStore.addTimerTime(request.params.id, request.body)));
  router.post("/:id/pause", mutation("paused", (request) => scheduleStore.pauseTimer(request.params.id)));
  router.post("/:id/resume", mutation("resumed", (request) => scheduleStore.resumeTimer(request.params.id)));
  router.post("/:id/cancel", mutation("cancelled", (request) => scheduleStore.cancelTimer(request.params.id)));

  router.use(scheduleErrorHandler);
  return router;
}

/**
 * REST API for routine appointments, mounted at /api/admin/routines behind the admin PIN.
 * Every mutation returns { routine } and broadcasts a "routines" frame event.
 */
export function createRoutinesRouter(scheduleStore, emit) {
  const router = express.Router();

  const mutation = (action, run) => (request, response) => {
    const routine = run(request);
    emit("routines", { action, routine });
    response.status(action === "created" ? 201 : 200).json({ routine });
  };

  router.get("/", (request, response) => {
    response.json({
      routines: scheduleStore.listRoutines({ includeCancelled: request.query.includeCancelled === "true" })
    });
  });
  router.post("/", mutation("created", (request) => scheduleStore.createRoutine(request.body)));

  // Must precede "/:id".
  router.get("/occurrences", (request, response) => {
    const now = scheduleStore.now();
    const fromMs = parseInstantParam(request.query.from, "from", now);
    const toMs = parseInstantParam(request.query.to, "to", fromMs + DEFAULT_OCCURRENCE_WINDOW_MS);
    if (toMs <= fromMs) throw new ScheduleError(400, "invalid-input", "to must be after from");
    if (toMs - fromMs > MAX_OCCURRENCE_WINDOW_MS) {
      throw new ScheduleError(400, "invalid-input", "The window between from and to must be at most 31 days");
    }
    response.json({
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      timeZone: scheduleStore.timeZone,
      occurrences: scheduleStore.listUpcomingOccurrences({ fromMs, toMs })
    });
  });

  router.get("/:id", (request, response) => {
    response.json({ routine: scheduleStore.getRoutine(request.params.id) });
  });
  router.patch("/:id", mutation("updated", (request) => scheduleStore.updateRoutine(request.params.id, request.body)));
  router.post("/:id/pause", mutation("paused", (request) => scheduleStore.pauseRoutine(request.params.id, request.body)));
  router.post("/:id/resume", mutation("resumed", (request) => scheduleStore.resumeRoutine(request.params.id)));
  router.post("/:id/cancel", mutation("cancelled", (request) => scheduleStore.cancelRoutine(request.params.id)));
  router.put("/:id/exceptions/:date", mutation("exception-set", (request) =>
    scheduleStore.setOccurrenceException(request.params.id, request.params.date, request.body ?? {})));
  router.delete("/:id/exceptions/:date", mutation("exception-cleared", (request) =>
    scheduleStore.clearOccurrenceException(request.params.id, request.params.date)));

  router.use(scheduleErrorHandler);
  return router;
}

/**
 * Read-only schedule for the frame display, mounted at /api/schedule WITHOUT the admin PIN: the frame is a
 * plain browser page and cannot hold the PIN (its configuration is publicly readable). It exposes what is
 * on screen anyway (titles and times, like the calendar) and never changes anything.
 * serverTime lets the frame correct for a different local clock.
 */
export function createPublicScheduleRouter(scheduleStore) {
  const router = express.Router();
  router.get("/", (_request, response) => {
    response.json(scheduleStore.getPublicSchedule());
  });
  router.use(scheduleErrorHandler);
  return router;
}

/** JSON errors for schedule routes, including malformed JSON bodies rejected by express.json(). */
export function scheduleErrorHandler(error, _request, response, _next) {
  if (error instanceof ScheduleError) {
    response.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    response.status(400).json({ error: "Request body is not valid JSON", code: "invalid-input" });
    return;
  }
  console.error("Schedule API error:", error);
  response.status(500).json({ error: "Internal error", code: "internal" });
}

/** Accepts ISO 8601 strings with an explicit offset or Z; omitted → fallback. */
function parseInstantParam(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  const ms = typeof value === "string" && /T.*(Z|[+-]\d{2}:?\d{2})$/.test(value) ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) {
    throw new ScheduleError(400, "invalid-input", `${name} must be an ISO 8601 date-time with offset, e.g. 2025-09-15T08:00:00Z`);
  }
  return ms;
}
