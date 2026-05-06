import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import multer from "multer";

await loadDotEnv();

const rootDir = process.cwd();
const dataDir = process.env.FRAME_DATA_DIR ? path.resolve(process.env.FRAME_DATA_DIR) : path.join(rootDir, "data");
const photoDir = path.join(dataDir, "photos");
const trashDir = path.join(dataDir, "trash");
const dbPath = path.join(dataDir, "photos.json");
const legacySettingsPath = path.join(dataDir, "settings.json");
const settingsDbPath = path.join(dataDir, "settings.sqlite");
const distDir = path.join(rootDir, "dist");
const indexPath = path.join(distDir, "index.html");
const refreshScript = process.env.FRAME_REFRESH_SCRIPT
  ? path.resolve(process.env.FRAME_REFRESH_SCRIPT)
  : path.join(rootDir, "scripts", "remote-refresh.sh");
const port = Number(process.env.FRAME_PHOTO_SERVER_PORT || 8787);
const adminPin = process.env.FRAME_ADMIN_PIN || "";
const telegramToken = process.env.FRAME_TELEGRAM_BOT_TOKEN || "";
const calendarIcsUrl = process.env.FRAME_CALENDAR_ICS_URL || "";
const calendarSourcesFile = process.env.FRAME_CALENDAR_SOURCES_FILE
  ? path.resolve(process.env.FRAME_CALENDAR_SOURCES_FILE)
  : "";
const calendarCacheMs = Number(process.env.FRAME_CALENDAR_CACHE_SECONDS || 900) * 1000;
const allowedTelegramChats = new Set(
  (process.env.FRAME_TELEGRAM_ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
let calendarCache = {
  text: "",
  fetchedAt: 0
};
const sourceCalendarCache = new Map();
let settingsDb = null;

const allowedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

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
app.use("/media/photos", express.static(photoDir, { fallthrough: false }));
app.use(express.static(distDir, {
  fallthrough: true,
  etag: false,
  lastModified: false,
  setHeaders(response) {
    response.setHeader("Cache-Control", "no-store");
  }
}));

await ensureStorage();
await ensureCalendarSourcesSettings();

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/calendar.ics", async (_request, response) => {
  try {
    const calendarText = await fetchCalendarIcs();
    response.type("text/calendar").set("Cache-Control", "no-store").send(calendarText);
  } catch (error) {
    console.error("Calendar fetch failed:", error.message);
    response.status(502).json({ error: "Calendar unavailable" });
  }
});

app.get("/api/calendar-sources.json", async (_request, response) => {
  const sources = enabledCalendarSources(await readCalendarSourcesFromSettings());
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
  const sources = enabledCalendarSources(await readCalendarSourcesFromSettings());
  if (!Number.isInteger(index) || index < 0 || index >= sources.length) {
    response.status(404).json({ error: "Calendar source not configured" });
    return;
  }

  try {
    const calendarText = await fetchCachedRemoteCalendar(sources[index].icsUrl);
    response.type("text/calendar").set("Cache-Control", "no-store").send(calendarText);
  } catch (error) {
    console.error("Calendar source fetch failed:", error.message);
    response.status(502).json({ error: "Calendar unavailable" });
  }
});

app.get("/api/photos", async (request, response) => {
  const status = typeof request.query.status === "string" ? request.query.status : "approved";
  const photos = await listPhotos();
  response.json({
    photos: photos
      .filter((photo) => photo.status === status)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  });
});

app.get("/api/settings", async (_request, response) => {
  response.json(await readPublicSettings());
});

app.get("/api/admin/settings", requireAdmin, async (_request, response) => {
  response.json(await readSettings());
});

app.put("/api/admin/settings", requireAdmin, async (request, response) => {
  const normalizedSettings = normalizeSettings(request.body);
  if (!normalizedSettings) {
    response.status(400).json({ error: "Unsupported settings payload" });
    return;
  }

  const currentSettings = await readSettings();
  const settings = mergeSettings(currentSettings, normalizedSettings);
  await writeSettings(settings);
  response.json(settings);
});

app.get("/api/admin/photos", requireAdmin, async (_request, response) => {
  response.json({ photos: await listPhotos() });
});

app.post("/api/admin/photos", requireAdmin, upload.array("photos"), async (request, response) => {
  const files = Array.isArray(request.files) ? request.files : [];
  const results = [];

  for (const file of files) {
    results.push(await ingestBuffer(file.buffer, {
      originalName: file.originalname,
      mimeType: file.mimetype,
      source: "web"
    }));
  }

  response.status(201).json({
    results,
    photos: await listPhotos()
  });
});

app.patch("/api/admin/photos/:id", requireAdmin, async (request, response) => {
  const nextStatus = request.body?.status;
  if (!["pending", "approved", "hidden", "trashed"].includes(nextStatus)) {
    response.status(400).json({ error: "Unsupported status" });
    return;
  }

  const db = await readDb();
  const photo = db.photos.find((entry) => entry.id === request.params.id);
  if (!photo) {
    response.status(404).json({ error: "Photo not found" });
    return;
  }

  photo.status = nextStatus;
  photo.updatedAt = new Date().toISOString();
  await writeDb(db);
  response.json({ photo });
});

app.delete("/api/admin/photos/:id", requireAdmin, async (request, response) => {
  const db = await readDb();
  const photo = db.photos.find((entry) => entry.id === request.params.id);
  if (!photo) {
    response.status(404).json({ error: "Photo not found" });
    return;
  }

  photo.status = "trashed";
  photo.updatedAt = new Date().toISOString();
  await writeDb(db);
  response.json({ photo });
});

app.post("/api/admin/refresh", requireAdmin, async (_request, response) => {
  const started = await triggerRefresh("admin-api");
  response.status(started ? 202 : 409).json({
    accepted: started,
    message: started ? "Refresh started" : "Refresh already running"
  });
});

app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api/") || request.path.startsWith("/media/")) {
    next();
    return;
  }

  response.sendFile(indexPath, (error) => {
    if (error) {
      response.status(503).send("Family Frame has not been built yet. Run npm run build.");
    }
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Photo server listening on http://127.0.0.1:${port}`);
});

if (telegramToken) {
  startTelegramPolling().catch((error) => {
    console.error("Telegram polling stopped:", error);
  });
}

function requireAdmin(request, response, next) {
  if (!adminPin || request.header("x-frame-admin-pin") === adminPin) {
    next();
    return;
  }

  response.status(401).json({ error: "Admin PIN required" });
}

async function ensureStorage() {
  await fs.mkdir(photoDir, { recursive: true });
  await fs.mkdir(trashDir, { recursive: true });
  await ensureSettingsDb();
  try {
    await fs.access(dbPath);
  } catch {
    await writeDb({ photos: [] });
  }
}

async function listPhotos() {
  const db = await readDb();
  return db.photos.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function readDb() {
  try {
    const text = await fs.readFile(dbPath, "utf8");
    const parsed = JSON.parse(text);
    return { photos: Array.isArray(parsed.photos) ? parsed.photos : [] };
  } catch {
    return { photos: [] };
  }
}

async function writeDb(db) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmpPath = `${dbPath}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, dbPath);
}

async function readSettings() {
  try {
    const row = getSettingsDb()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("frame-settings");
    if (!row?.value) return {};
    const parsed = JSON.parse(row.value);
    return normalizeSettings(parsed) || {};
  } catch {
    return {};
  }
}

async function readPublicSettings() {
  const settings = await readSettings();
  if (!Array.isArray(settings.calendar?.sources)) return settings;

  return {
    ...settings,
    calendar: {
      ...settings.calendar,
      sources: enabledCalendarSources(settings.calendar.sources).map((source, index) => ({
        id: source.id,
        label: source.label,
        icsUrl: `/api/calendars/${index + 1}.ics`,
        enabled: true
      }))
    }
  };
}

async function writeSettings(settings) {
  const now = new Date().toISOString();
  calendarCache = { text: "", fetchedAt: 0 };
  sourceCalendarCache.clear();
  getSettingsDb()
    .prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)
    .run("frame-settings", JSON.stringify(settings), now);
}

async function ensureSettingsDb() {
  getSettingsDb().exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const existing = getSettingsDb()
    .prepare("SELECT 1 FROM settings WHERE key = ?")
    .get("frame-settings");
  if (existing) return;

  try {
    const text = await fs.readFile(legacySettingsPath, "utf8");
    const legacySettings = normalizeSettings(JSON.parse(text));
    if (legacySettings) await writeSettings(legacySettings);
  } catch {
    await writeSettings({});
  }
}

async function ensureCalendarSourcesSettings() {
  const currentSettings = await readSettings();
  if (Array.isArray(currentSettings.calendar?.sources)) return;

  const sources = await initialCalendarSources();
  if (sources.length === 0) return;

  await writeSettings(mergeSettings(currentSettings, { calendar: { sources } }));
}

function getSettingsDb() {
  if (!settingsDb) {
    settingsDb = new DatabaseSync(settingsDbPath);
  }
  return settingsDb;
}

function normalizeSettings(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const settings = {};
  const calendarSources = payload.calendar?.sources;
  const importantKeywords = payload.calendar?.importantKeywords;
  if (calendarSources !== undefined || importantKeywords !== undefined) {
    settings.calendar = {};
    if (calendarSources !== undefined) {
      if (!Array.isArray(calendarSources)) return null;
      const normalizedSources = normalizeCalendarSources(calendarSources);
      if (!normalizedSources) return null;
      settings.calendar.sources = normalizedSources;
    }
    if (importantKeywords !== undefined) {
      if (!Array.isArray(importantKeywords)) return null;
      settings.calendar.importantKeywords = normalizeStringList(importantKeywords);
    }
  }

  const disabledSpecialDayIds = payload.specialDays?.disabledIds;
  const specialDayEvents = payload.specialDays?.events;
  if (disabledSpecialDayIds !== undefined || specialDayEvents !== undefined) {
    if (disabledSpecialDayIds !== undefined && !Array.isArray(disabledSpecialDayIds)) return null;
    if (specialDayEvents !== undefined && !Array.isArray(specialDayEvents)) return null;
    const normalizedEvents = specialDayEvents === undefined
      ? undefined
      : normalizeSpecialDayEvents(specialDayEvents);
    if (specialDayEvents !== undefined && !normalizedEvents) return null;
    settings.specialDays = {
      disabledIds: normalizeStringList(disabledSpecialDayIds || [])
    };
    if (normalizedEvents) settings.specialDays.events = normalizedEvents;
  }

  return settings;
}

function mergeSettings(currentSettings, nextSettings) {
  return {
    ...currentSettings,
    ...nextSettings,
    calendar: {
      ...currentSettings.calendar,
      ...nextSettings.calendar
    },
    specialDays: {
      ...currentSettings.specialDays,
      ...nextSettings.specialDays
    }
  };
}

function normalizeStringList(values) {
  return [...new Set(values
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))];
}

function normalizeCalendarSources(sources) {
  const normalized = [];
  const seenIds = new Set();
  const seenUrls = new Set();

  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const icsUrl = typeof source.icsUrl === "string" ? source.icsUrl.trim() : "";
    if (!icsUrl) continue;
    const id = typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : calendarSourceId(source.label, icsUrl);
    const uniqueId = uniqueCalendarSourceId(id, seenIds);
    const urlKey = icsUrl.toLocaleLowerCase();
    if (seenUrls.has(urlKey)) continue;
    seenIds.add(uniqueId);
    seenUrls.add(urlKey);
    normalized.push({
      id: uniqueId,
      label: typeof source.label === "string" && source.label.trim()
        ? source.label.trim()
        : `Calendario ${normalized.length + 1}`,
      icsUrl,
      enabled: source.enabled !== false
    });
  }

  return normalized;
}

function normalizeSpecialDayEvents(events) {
  const normalized = [];
  const seenIds = new Set();

  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) return null;
    const id = typeof event.id === "string" ? event.id.trim() : "";
    const label = typeof event.label === "string" ? event.label.trim() : "";
    const theme = typeof event.theme === "string" ? event.theme.trim() : "";
    const effects = Array.isArray(event.effects) ? normalizeStringList(event.effects) : [];
    const schedule = normalizeSpecialDaySchedule(event.schedule);
    if (!id || !label || !theme || effects.length === 0 || !schedule || seenIds.has(id)) return null;
    seenIds.add(id);
    normalized.push({
      id,
      label,
      enabled: event.enabled !== false,
      theme,
      schedule,
      effects
    });
  }

  return normalized;
}

function normalizeSpecialDaySchedule(schedule) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return null;

  if (schedule.type === "fixedDate") {
    const month = normalizeInteger(schedule.month, 1, 12);
    const day = normalizeInteger(schedule.day, 1, daysInMonth(month || 1));
    if (!month || !day) return null;
    return { type: "fixedDate", month, day };
  }

  if (schedule.type === "dateRange") {
    const start = normalizeMonthDay(schedule.start);
    const end = normalizeMonthDay(schedule.end);
    if (!start || !end) return null;
    return { type: "dateRange", start, end };
  }

  if (schedule.type === "nthWeekday") {
    const month = normalizeInteger(schedule.month, 1, 12);
    const weekday = normalizeInteger(schedule.weekday, 0, 6);
    const nth = normalizeInteger(schedule.nth, 1, 5);
    if (!month || weekday === null || !nth) return null;
    return { type: "nthWeekday", month, weekday, nth };
  }

  if (schedule.type === "easterOffset") {
    const offsetDays = normalizeInteger(schedule.offsetDays, -30, 30);
    const durationDays = normalizeInteger(schedule.durationDays ?? 1, 1, 7);
    if (offsetDays === null || !durationDays) return null;
    return { type: "easterOffset", offsetDays, durationDays };
  }

  return null;
}

function normalizeMonthDay(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const month = normalizeInteger(value.month, 1, 12);
  const day = normalizeInteger(value.day, 1, daysInMonth(month || 1));
  if (!month || !day) return null;
  return { month, day };
}

function normalizeInteger(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function daysInMonth(month) {
  return new Date(2024, month, 0).getDate();
}

async function fetchCalendarIcs() {
  const sources = enabledCalendarSources(await readCalendarSourcesFromSettings());
  if (sources.length === 0) {
    throw new Error("Calendar sources are not configured");
  }

  const now = Date.now();
  if (calendarCache.text && now - calendarCache.fetchedAt < calendarCacheMs) {
    return calendarCache.text;
  }

  try {
    const calendars = await Promise.all(sources.map((source) => fetchCachedRemoteCalendar(source.icsUrl)));
    const calendarText = calendars.length === 1 ? calendars[0] : mergeCalendars(calendars);

    calendarCache = {
      text: calendarText,
      fetchedAt: now
    };
    return calendarText;
  } catch (error) {
    if (calendarCache.text) {
      console.warn("Using cached calendar after fetch failure:", error.message);
      return calendarCache.text;
    }
    throw error;
  }
}

async function readCalendarSourcesFromSettings() {
  const settings = await readSettings();
  return Array.isArray(settings.calendar?.sources) ? settings.calendar.sources : [];
}

function enabledCalendarSources(sources) {
  return sources.filter((source) => source.enabled !== false && typeof source.icsUrl === "string" && source.icsUrl.trim());
}

async function initialCalendarSources() {
  const fileSources = await loadCalendarSourcesFile();
  if (fileSources.length > 0) return fileSources;

  return splitEnvList(process.env.FRAME_CALENDAR_ICS_URLS || calendarIcsUrl)
    .map((icsUrl, index) => ({
      id: calendarSourceId(`Calendario ${index + 1}`, icsUrl),
      label: index === 0 ? "Famiglia" : `Calendario ${index + 1}`,
      icsUrl,
      enabled: true
    }));
}

async function loadCalendarSourcesFile() {
  if (!calendarSourcesFile) return [];

  try {
    const text = await fs.readFile(calendarSourcesFile, "utf8");
    const parsed = JSON.parse(text);
    const entries = Array.isArray(parsed) ? parsed : parsed.sources;
    if (!Array.isArray(entries)) {
      throw new Error("Calendar sources file must contain an array or a { sources: [] } object");
    }

    return entries
      .filter((entry) => entry && typeof entry.icsUrl === "string" && entry.icsUrl.trim())
      .map((entry, index) => ({
        id: typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : calendarSourceId(entry.label || `Calendario ${index + 1}`, entry.icsUrl),
        label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : `Calendario ${index + 1}`,
        icsUrl: entry.icsUrl.trim(),
        enabled: entry.enabled !== false
      }));
  } catch (error) {
    console.error(`Calendar sources file could not be loaded from ${calendarSourcesFile}:`, error.message);
    return [];
  }
}

function calendarSourceId(label, icsUrl) {
  const base = String(label || "calendario")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "calendario";
  return `${base}-${crypto.createHash("sha1").update(icsUrl).digest("hex").slice(0, 8)}`;
}

function uniqueCalendarSourceId(id, seenIds) {
  let candidate = id;
  let counter = 2;
  while (seenIds.has(candidate)) {
    candidate = `${id}-${counter}`;
    counter += 1;
  }
  return candidate;
}

async function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  try {
    const text = await fs.readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue
        .replace(/^(['"])(.*)\1$/, "$2")
        .replace(/\\n/g, "\n");
    }
  } catch {
    // .env is optional; systemd can inject the same values through EnvironmentFile.
  }
}

async function fetchCachedRemoteCalendar(url) {
  const now = Date.now();
  const cached = sourceCalendarCache.get(url);
  if (cached?.text && now - cached.fetchedAt < calendarCacheMs) {
    return cached.text;
  }

  try {
    const text = await fetchRemoteCalendar(url);
    sourceCalendarCache.set(url, { text, fetchedAt: now });
    return text;
  } catch (error) {
    if (cached?.text) {
      console.warn("Using cached calendar source after fetch failure:", error.message);
      return cached.text;
    }
    throw error;
  }
}

function splitEnvList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function fetchRemoteCalendar(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) {
    throw new Error(`Calendar source returned ${response.status}`);
  }

  const calendarText = await response.text();
  if (!calendarText.includes("BEGIN:VCALENDAR")) {
    throw new Error("Response is not an iCalendar feed");
  }

  return calendarText;
}

function mergeCalendars(calendars) {
  const body = calendars.flatMap(calendarComponentLines);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Frame//Calendar Merge//EN",
    ...body,
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}

function calendarComponentLines(calendarText) {
  const lines = calendarText.split(/\r?\n/);
  const components = [];
  let depth = 0;
  let current = [];

  for (const line of lines) {
    if (line === "BEGIN:VEVENT" || line === "BEGIN:VTIMEZONE") {
      depth = 1;
      current = [line];
      continue;
    }

    if (depth === 0) continue;

    current.push(line);

    if (line.startsWith("BEGIN:")) {
      depth += 1;
      continue;
    }

    if (line.startsWith("END:")) {
      depth -= 1;
      if (depth === 0) {
        components.push(...current);
        current = [];
      }
    }
  }

  return components;
}

async function ingestBuffer(buffer, { originalName, mimeType, source }) {
  if (!allowedMimeTypes.has(mimeType)) {
    return { accepted: false, reason: "unsupported-type", name: originalName };
  }

  if (buffer.byteLength < 5 * 1024) {
    return { accepted: false, reason: "too-small", name: originalName };
  }

  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const db = await readDb();
  const existing = db.photos.find((photo) => photo.hash === hash);
  if (existing) {
    return { accepted: false, reason: "duplicate", name: originalName, photo: existing };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const extension = allowedMimeTypes.get(mimeType);
  const filename = `${now.slice(0, 10)}-${id}${extension}`;
  const filePath = path.join(photoDir, filename);
  await fs.writeFile(filePath, buffer);

  const photo = {
    id,
    src: `/media/photos/${filename}`,
    thumbSrc: `/media/photos/${filename}`,
    filename,
    originalName,
    mimeType,
    size: buffer.byteLength,
    hash,
    status: "pending",
    source,
    createdAt: now,
    updatedAt: now
  };

  db.photos.unshift(photo);
  await writeDb(db);
  return { accepted: true, photo };
}

async function startTelegramPolling() {
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      timeout: "25",
      allowed_updates: JSON.stringify(["message"])
    });
    if (offset) params.set("offset", String(offset));

    try {
      const payload = await telegramApi("getUpdates", params);
      for (const update of payload.result || []) {
        offset = Math.max(offset, update.update_id + 1);
        await handleTelegramMessage(update.message);
      }
    } catch (error) {
      console.error("Telegram polling error:", error.message);
      await delay(5000);
    }
  }
}

async function handleTelegramMessage(message) {
  if (!message?.chat?.id) return;
  const chatId = String(message.chat.id);
  if (allowedTelegramChats.size > 0 && !allowedTelegramChats.has(chatId)) return;

  if (typeof message.text === "string" && message.text.trim().startsWith("/refresh")) {
    const started = await triggerRefresh(`telegram:${chatId}`);
    await telegramApi("sendMessage", new URLSearchParams({
      chat_id: chatId,
      text: started ? "Refresh avviato." : "Refresh gia in corso."
    }));
    return;
  }

  const photoSizes = Array.isArray(message.photo) ? message.photo : [];
  const document = message.document;
  const photoFile = photoSizes.at(-1);
  const fileId = photoFile?.file_id || (document?.mime_type?.startsWith("image/") ? document.file_id : "");
  if (!fileId) return;

  const filePayload = await telegramApi("getFile", new URLSearchParams({ file_id: fileId }));
  const filePath = filePayload.result?.file_path;
  if (!filePath) return;

  const fileResponse = await fetch(`https://api.telegram.org/file/bot${telegramToken}/${filePath}`);
  if (!fileResponse.ok) throw new Error(`Telegram file download failed: ${fileResponse.status}`);

  const arrayBuffer = await fileResponse.arrayBuffer();
  const mimeType = document?.mime_type || mimeTypeFromTelegramPath(filePath);
  const result = await ingestBuffer(Buffer.from(arrayBuffer), {
    originalName: document?.file_name || path.basename(filePath),
    mimeType,
    source: "telegram"
  });

  if (result.accepted) {
    await telegramApi("sendMessage", new URLSearchParams({
      chat_id: chatId,
      text: "Foto ricevuta. La trovi nella coda da approvare del frame."
    }));
  }
}

async function telegramApi(method, params) {
  const response = await fetch(`https://api.telegram.org/bot${telegramToken}/${method}?${params.toString()}`);
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);
  return response.json();
}

let refreshRunning = false;

async function triggerRefresh(source) {
  if (refreshRunning) return false;
  refreshRunning = true;

  const child = spawn("bash", [refreshScript], {
    cwd: rootDir,
    detached: true,
    env: {
      ...process.env,
      FRAME_REFRESH_SOURCE: source
    },
    stdio: "ignore"
  });
  child.unref();

  setTimeout(() => {
    refreshRunning = false;
  }, 60_000);

  return true;
}

function mimeTypeFromTelegramPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
