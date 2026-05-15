import express from "express";
import multer from "multer";
import { enabledCalendarSources, mergeSettings, normalizeSettings } from "./settings-utils.mjs";

export function createPhotoServerApp({
  runtime,
  calendarService,
  clientLog,
  photoStore,
  settingsStore,
  systemActions
}) {
  const frameEventClients = new Set();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 40
    }
  });
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/media/photos", express.static(runtime.photoDir, { fallthrough: false }));
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
    response.json(await settingsStore.readPublicSettings());
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

  app.get("/api/admin/settings", requireAdmin(runtime), async (_request, response) => {
    response.json(await settingsStore.readSettings());
  });

  app.put("/api/admin/settings", requireAdmin(runtime), async (request, response) => {
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
        response.status(500).json({ error: "Night display timers could not be updated" });
        return;
      }
    }
    await settingsStore.writeSettings(settings);
    emitFrameEvent(frameEventClients, "settings", { settings });
    response.json(settings);
  });

  app.get("/api/admin/photos", requireAdmin(runtime), async (_request, response) => {
    response.json({ photos: await photoStore.listPhotos() });
  });

  app.post("/api/admin/photos", requireAdmin(runtime), upload.array("photos"), async (request, response) => {
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

  app.patch("/api/admin/photos/:id", requireAdmin(runtime), async (request, response) => {
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

  app.delete("/api/admin/photos/:id", requireAdmin(runtime), async (request, response) => {
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

  app.post("/api/admin/refresh", requireAdmin(runtime), async (_request, response) => {
    const started = await systemActions.triggerRefresh("admin-api");
    response.status(started ? 202 : 409).json({
      accepted: started,
      message: started ? "Refresh started" : "Refresh already running"
    });
  });

  app.post("/api/admin/display/:action", requireAdmin(runtime), async (request, response) => {
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
      response.status(500).json({ error: `Display could not be turned ${action}` });
    }
  });

  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/") || request.path.startsWith("/media/")) {
      next();
      return;
    }

    response.sendFile(runtime.indexPath, (error) => {
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

function requireAdmin(runtime) {
  return (request, response, next) => {
    if (!runtime.adminPin || request.header("x-frame-admin-pin") === runtime.adminPin) {
      next();
      return;
    }

    response.status(401).json({ error: "Admin PIN required" });
  };
}
