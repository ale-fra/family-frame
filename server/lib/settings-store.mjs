import fs from "node:fs/promises";
import { openDatabase } from "./database.mjs";
import {
  calendarSourceId,
  enabledCalendarSources,
  mergeSettings,
  normalizeCalendarSources,
  normalizeSettings
} from "./settings-utils.mjs";

/** @param options.db shared connection (see database.mjs); opened from runtime.settingsDbPath when omitted */
export function createSettingsStore(runtime, onSettingsWritten = () => {}, { db = null } = {}) {
  let settingsDb = db;

  function getSettingsDb() {
    if (!settingsDb) {
      settingsDb = openDatabase(runtime.settingsDbPath);
    }
    return settingsDb;
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
      const text = await fs.readFile(runtime.legacySettingsPath, "utf8");
      const legacySettings = normalizeSettings(JSON.parse(text));
      if (legacySettings) await writeSettings(legacySettings);
    } catch {
      await writeSettings({});
    }
  }

  async function ensureCalendarSourcesSettings() {
    const currentSettings = await readSettings();
    if (Array.isArray(currentSettings.calendar?.sources)) return;

    const sources = await initialCalendarSources(runtime);
    if (sources.length === 0) return;

    await writeSettings(mergeSettings(currentSettings, { calendar: { sources } }));
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
    onSettingsWritten();
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

  async function readCalendarSourcesFromSettings() {
    const settings = await readSettings();
    return Array.isArray(settings.calendar?.sources) ? settings.calendar.sources : [];
  }

  async function clearPinnedPhotoIfNeeded(photoId) {
    const settings = await readSettings();
    if (settings.slideshow?.pinnedPhotoId !== photoId) return;
    await writeSettings(mergeSettings(settings, { slideshow: { pinnedPhotoId: "" } }));
  }

  return {
    clearPinnedPhotoIfNeeded,
    ensureCalendarSourcesSettings,
    ensureSettingsDb,
    readCalendarSourcesFromSettings,
    readPublicSettings,
    readSettings,
    writeSettings
  };
}

async function initialCalendarSources(runtime) {
  const fileSources = await loadCalendarSourcesFile(runtime.calendarSourcesFile);
  if (fileSources.length > 0) return fileSources;

  return splitEnvList(process.env.FRAME_CALENDAR_ICS_URLS || runtime.calendarIcsUrl)
    .map((icsUrl, index) => ({
      id: calendarSourceId(`Calendario ${index + 1}`, icsUrl),
      label: index === 0 ? "Famiglia" : `Calendario ${index + 1}`,
      icsUrl,
      enabled: true
    }));
}

async function loadCalendarSourcesFile(calendarSourcesFile) {
  if (!calendarSourcesFile) return [];

  try {
    const text = await fs.readFile(calendarSourcesFile, "utf8");
    const parsed = JSON.parse(text);
    const entries = Array.isArray(parsed) ? parsed : parsed.sources;
    if (!Array.isArray(entries)) {
      throw new Error("Calendar sources file must contain an array or a { sources: [] } object");
    }

    return normalizeCalendarSources(entries) || [];
  } catch (error) {
    console.error(`Calendar sources file could not be loaded from ${calendarSourcesFile}:`, error.message);
    return [];
  }
}

function splitEnvList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
