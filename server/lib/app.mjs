import express from "express";
import multer from "multer";
import path from "node:path";
import { createAdminAuth } from "./admin-auth.mjs";
import { registerApiDocs } from "./api-docs.mjs";
import {
  createPublicScheduleRouter,
  createRoutinesRouter,
  createTimersRouter,
  scheduleErrorHandler
} from "./schedule-routes.mjs";
import { enabledCalendarSources, mergeSettings, normalizeSettings } from "./settings-utils.mjs";

export function createFrameServerApp({
  runtime,
  calendarService,
  clientLog,
  photoStore,
  settingsStore,
  systemActions,
  scheduleStore,
  scheduleEvents = null,
  apiTokens = null
}) {
  // One instance, so the failed-attempt limiter is shared by every admin route.
  const requireAdmin = createAdminAuth({ runtime, apiTokens });
  const frameEventClients = new Set();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 40
    }
  });
  const app = express();
  // Read-only, from FRAME_LOCALE and FRAME_TIMEZONE; added to settings responses, never stored. The frame formats
  // its clock and dates with them, so the screen and routine times agree whatever the browser's own settings.
  const withI18n = (settings) => (runtime.locale
    ? { ...settings, i18n: { locale: runtime.locale, language: runtime.language, timeZone: runtime.timeZone } }
    : settings);

  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/media/photos", express.static(runtime.photoDir, { fallthrough: false }));
  if (runtime.configFile) {
    app.get("/frame.config.json", (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.sendFile(path.basename(runtime.configFile), { root: path.dirname(runtime.configFile) });
    });
  }
  app.use(express.static(runtime.distDir, {
    fallthrough: true,
    etag: false,
    lastModified: false,
    setHeaders(response) {
      response.setHeader("Cache-Control", "no-store");
    }
  }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/admin/capabilities", requireAdmin, (_request, response) => {
    response.json(systemActions.capabilities);
  });

  app.get("/api/events", (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.write(`data: ${JSON.stringify({ type: "connected", at: new Date().toISOString() })}\n\n`);
    frameEventClients.add(response);

    const heartbeat = setInterval(() => {
      response.write(`data: ${JSON.stringify({ type: "heartbeat", at: new Date().toISOString() })}\n\n`);
    }, 30_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      frameEventClients.delete(response);
    });
  });

  app.get("/api/calendar.ics", async (_request, response) => {
    try {
      const calendarText = await calendarService.fetchCalendarIcs();
      response.type("text/calendar").set("Cache-Control", "no-store").send(calendarText);
    } catch (error) {
      console.error("Calendar fetch failed:", error.message);
      response.status(502).json({ error: "Calendar unavailable" });
    }
  });

  app.get("/api/calendar-sources.json", async (_request, response) => {
    const sources = enabledCalendarSources(await settingsStore.readCalendarSourcesFromSettings());
    if (sources.length === 0) {
      response.status(404).json({ error: "Calendar sources are not configured" });
      return;
    }

    response.json({
      sources: sources.map((source, index) => ({
        label: source.label,
        icsUrl: `/api/calendars/${index + 1}.ics`,
        enabled: source.enabled
      }))
    });
  });

  app.get("/api/calendars/:index.ics", async (request, response) => {
    const index = Number(request.params.index) - 1;
    const sources = enabledCalendarSources(await settingsStore.readCalendarSourcesFromSettings());
    if (!Number.isInteger(index) || index < 0 || index >= sources.length) {
      response.status(404).json({ error: "Calendar source not configured" });
      return;
    }

    try {
      const calendarText = await calendarService.fetchCachedRemoteCalendar(sources[index].icsUrl);
      response.type("text/calendar").set("Cache-Control", "no-store").send(calendarText);
    } catch (error) {
      console.error("Calendar source fetch failed:", error.message);
      response.status(502).json({ error: "Calendar unavailable" });
    }
  });

  app.get("/api/photos", async (request, response) => {
    const status = typeof request.query.status === "string" ? request.query.status : "approved";
    const photos = await photoStore.listPhotos();
    response.json({
      photos: photos
        .filter((photo) => photo.status === status)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    });
  });

  app.get("/api/settings", async (_request, response) => {
    response.json(withI18n(await settingsStore.readPublicSettings()));
  });

  app.post("/api/client-log", async (request, response) => {
    const entry = clientLog.normalizeClientLogEntry(request.body);
    if (!entry) {
      response.status(400).json({ error: "Unsupported log payload" });
      return;
    }

    try {
      await clientLog.appendClientLog(entry);
      console.warn(`[frame-client] ${entry.event}`, entry);
      response.status(202).json({ accepted: true });
    } catch (error) {
      console.error("Client log write failed:", error.message);
      response.status(500).json({ error: "Client log could not be written" });
    }
  });

  app.get("/api/admin/settings", requireAdmin, async (_request, response) => {
    response.json(withI18n(await settingsStore.readSettings()));
  });

  app.put("/api/admin/settings", requireAdmin, async (request, response) => {
    const normalizedSettings = normalizeSettings(request.body);
    if (!normalizedSettings) {
      response.status(400).json({ error: "Unsupported settings payload" });
      return;
    }

    const currentSettings = await settingsStore.readSettings();
    const settings = mergeSettings(currentSettings, normalizedSettings);
    if (normalizedSettings.display?.nightMode) {
      try {
        await systemActions.applyNightDisplaySettings(settings.display.nightMode);
      } catch (error) {
        console.error("Night display timer update failed:", error.message);
        response.status(error.status === 501 ? 501 : 500).json({
          error: error.status === 501 ? error.message : "Night display timers could not be updated"
        });
        return;
      }
    }
    await settingsStore.writeSettings(settings);
    // /api/events is public: broadcast the public view (proxy URLs), never the private feed URLs.
    emitFrameEvent(frameEventClients, "settings", { settings: await settingsStore.readPublicSettings() });
    response.json(withI18n(settings));
  });

  app.get("/api/admin/photos", requireAdmin, async (_request, response) => {
    response.json({ photos: await photoStore.listPhotos() });
  });

  app.post("/api/admin/photos", requireAdmin, upload.array("photos"), async (request, response) => {
    const files = Array.isArray(request.files) ? request.files : [];
    const results = [];

    for (const file of files) {
      results.push(await photoStore.ingestBuffer(file.buffer, {
        originalName: file.originalname,
        mimeType: file.mimetype,
        source: "web"
      }));
    }

    const photos = await photoStore.listPhotos();
    emitFrameEvent(frameEventClients, "photos", { count: photos.length });
    response.status(201).json({
      results,
      photos
    });
  });

  app.patch("/api/admin/photos/:id", requireAdmin, async (request, response) => {
    const nextStatus = request.body?.status;
    if (!["pending", "approved", "hidden", "trashed"].includes(nextStatus)) {
      response.status(400).json({ error: "Unsupported status" });
      return;
    }

    const db = await photoStore.readDb();
    const photo = db.photos.find((entry) => entry.id === request.params.id);
    if (!photo) {
      response.status(404).json({ error: "Photo not found" });
      return;
    }

    photo.status = nextStatus;
    photo.updatedAt = new Date().toISOString();
    await photoStore.writeDb(db);
    if (nextStatus !== "approved") await settingsStore.clearPinnedPhotoIfNeeded(photo.id);
    emitFrameEvent(frameEventClients, "photos", { photoId: photo.id, status: nextStatus });
    if (nextStatus !== "approved") emitFrameEvent(frameEventClients, "settings", {
      settings: await settingsStore.readPublicSettings()
    });
    response.json({ photo });
  });

  app.post("/api/admin/photos/:id/optimize", requireAdmin, async (request, response) => {
    try {
      const photo = await photoStore.optimizePhoto(request.params.id, request.body);
      const photos = await photoStore.listPhotos();
      emitFrameEvent(frameEventClients, "photos", { photoId: photo.id, optimized: true });
      response.json({ photo, photos });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        console.error("Photo optimization failed:", {
          photoId: request.params.id,
          message: error.message,
          stack: error.stack
        });
      }
      response.status(statusCode).json({ error: error.message || "Photo optimization failed" });
    }
  });

  app.delete("/api/admin/photos/:id/optimize", requireAdmin, async (request, response) => {
    try {
      const photo = await photoStore.removeOptimizedPhoto(request.params.id);
      const photos = await photoStore.listPhotos();
      emitFrameEvent(frameEventClients, "photos", { photoId: photo.id, optimized: false });
      response.json({ photo, photos });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error("Photo optimization removal failed:", error.message);
      response.status(statusCode).json({ error: error.message || "Photo optimization removal failed" });
    }
  });

  app.delete("/api/admin/photos/:id", requireAdmin, async (request, response) => {
    const db = await photoStore.readDb();
    const photo = db.photos.find((entry) => entry.id === request.params.id);
    if (!photo) {
      response.status(404).json({ error: "Photo not found" });
      return;
    }

    photo.status = "trashed";
    photo.updatedAt = new Date().toISOString();
    await photoStore.writeDb(db);
    await settingsStore.clearPinnedPhotoIfNeeded(photo.id);
    emitFrameEvent(frameEventClients, "photos", { photoId: photo.id, status: "trashed" });
    emitFrameEvent(frameEventClients, "settings", { settings: await settingsStore.readPublicSettings() });
    response.json({ photo });
  });

  app.post("/api/admin/refresh", requireAdmin, async (_request, response) => {
    try {
      const started = await systemActions.triggerRefresh("admin-api");
      response.status(started ? 202 : 409).json({
        accepted: started,
        message: started ? "Refresh started" : "Refresh already running"
      });
    } catch (error) {
      response.status(error.status === 501 ? 501 : 500).json({ error: error.message });
    }
  });

  app.post("/api/admin/display/:action", requireAdmin, async (request, response) => {
    const action = request.params.action;
    if (action !== "on" && action !== "off") {
      response.status(400).json({ error: "Unsupported display action" });
      return;
    }

    try {
      const settings = await settingsStore.readSettings();
      const requestedOutput = typeof request.body?.output === "string" ? request.body.output.trim() : "";
      const output = requestedOutput || settings.display?.nightMode?.output || "DVI-I-1-1";
      await systemActions.setDisplayPower(action, output);
      response.json({ ok: true, action, output });
    } catch (error) {
      console.error(`Display ${action} failed:`, error.message);
      response.status(error.status === 501 ? 501 : 500).json({
        error: error.status === 501 ? error.message : `Display could not be turned ${action}`
      });
    }
  });

  const requireSchedule = requireAdmin.for("schedule");
  if (runtime.apiDocs !== false) registerApiDocs(app, requireSchedule);

  if (scheduleStore) {
    const emit = (type, detail) => emitFrameEvent(frameEventClients, type, detail);
    const schedulePaths = ["/api/admin/timers", "/api/admin/routines"];
    scheduleEvents?.subscribe((event) => emit("schedule", event));
    app.use("/api/admin/timers", requireSchedule, createTimersRouter(scheduleStore, emit, scheduleEvents));
    app.use("/api/admin/routines", requireSchedule, createRoutinesRouter(scheduleStore, emit));
    app.use("/api/schedule", createPublicScheduleRouter(scheduleStore));
    // Body-parser errors (malformed JSON) happen before the routers; answer them as JSON too.
    app.use(schedulePaths, scheduleErrorHandler);
  }

  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/") || request.path.startsWith("/media/")) {
      next();
      return;
    }

    response.sendFile(path.basename(runtime.indexPath), { root: path.dirname(runtime.indexPath) }, (error) => {
      if (error) {
        response.status(503).send("Family Frame has not been built yet. Run npm run build.");
      }
    });
  });

  return app;
}

function emitFrameEvent(clients, type, detail = {}) {
  const payload = `data: ${JSON.stringify({ type, detail, at: new Date().toISOString() })}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}
