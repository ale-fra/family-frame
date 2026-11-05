import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function loadDotEnv() {
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

export function createRuntimeConfig() {
  const rootDir = process.cwd();
  const dataDir = process.env.FRAME_DATA_DIR ? path.resolve(process.env.FRAME_DATA_DIR) : path.join(rootDir, "data");
  const calendarSourcesFile = process.env.FRAME_CALENDAR_SOURCES_FILE
    ? path.resolve(process.env.FRAME_CALENDAR_SOURCES_FILE)
    : "";

  return {
    rootDir,
    dataDir,
    photoDir: path.join(dataDir, "photos"),
    optimizedPhotoDir: path.join(dataDir, "photos", "optimized"),
    trashDir: path.join(dataDir, "trash"),
    dbPath: path.join(dataDir, "photos.json"),
    clientLogPath: path.join(dataDir, "frame-client.log"),
    legacySettingsPath: path.join(dataDir, "settings.json"),
    settingsDbPath: path.join(dataDir, "settings.sqlite"),
    distDir: path.join(rootDir, "dist"),
    indexPath: path.join(rootDir, "dist", "index.html"),
    configFile: process.env.FRAME_CONFIG_FILE ? path.resolve(process.env.FRAME_CONFIG_FILE) : "",
    port: parsePort(),
    adminPin: process.env.FRAME_ADMIN_PIN || "",
    telegramToken: process.env.FRAME_TELEGRAM_BOT_TOKEN || "",
    calendarIcsUrl: process.env.FRAME_CALENDAR_ICS_URL || "",
    calendarSourcesFile,
    // Time zone for routine wall-clock times ("08:10"). Set it when the host runs in UTC.
    timeZone: process.env.FRAME_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ...parseLocale(process.env.FRAME_LOCALE),
    // How long finished timers / due routines stay on screen. Timers: 0 = until cancelled.
    timerAutoDismissMs: parseSeconds("FRAME_TIMER_AUTO_DISMISS_SECONDS", { min: 0 }) * 1000,
    routineAutoDismissMs: parseSeconds("FRAME_ROUTINE_AUTO_DISMISS_SECONDS", { min: 1 }) * 1000,
    // How countdowns are drawn unless a timer/routine chooses: disc, sweets, journey or clock.
    timerStyle: parseStyle("FRAME_TIMER_STYLE", "disc"),
    routineStyle: parseStyle("FRAME_ROUTINE_STYLE", "clock"),
    scheduleWebhook: parseWebhook(process.env.FRAME_SCHEDULE_WEBHOOK_URL, process.env.FRAME_SCHEDULE_WEBHOOK_SECRET),
    // Swagger UI at /api/docs and the spec at /api/openapi.json. On by default; both the spec and admin API require authentication when a PIN is configured.
    apiDocs: !["false", "0", "off", "no"].includes((process.env.FRAME_API_DOCS || "").trim().toLowerCase()),
    calendarCacheMs: Number(process.env.FRAME_CALENDAR_CACHE_SECONDS || 900) * 1000,
    maxClientLogBytes: 2 * 1024 * 1024,
    allowedTelegramChats: new Set(
      (process.env.FRAME_TELEGRAM_ALLOWED_CHAT_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  };
}

function parsePort() {
  const value = process.env.FRAME_SERVER_PORT?.trim() || process.env.FRAME_PHOTO_SERVER_PORT?.trim() || "8787";
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port > 65535) {
    throw new Error("FRAME_SERVER_PORT (or FRAME_PHOTO_SERVER_PORT) must be an integer from 0 to 65535");
  }
  return port;
}

const SUPPORTED_LANGUAGES = ["it", "en"];
const DEFAULT_LOCALE = { locale: "it-IT", language: "it" };

/**
 * FRAME_LOCALE: a BCP 47 tag whose language has translations (it, en), e.g. "en-GB" or "it".
 * `locale` drives date/time formatting (en-GB: 24 h, en-US: 12 h); `language` selects the texts.
 */
function parseLocale(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return DEFAULT_LOCALE;
  try {
    const [locale] = Intl.getCanonicalLocales(trimmed);
    const language = new Intl.Locale(locale).language;
    if (SUPPORTED_LANGUAGES.includes(language)) return { locale, language };
  } catch {
    // invalid tag: fall through to the warning
  }
  console.warn(`Ignoring FRAME_LOCALE=${value}: expected a locale for ${SUPPORTED_LANGUAGES.join(" or ")} (e.g. it-IT, en-GB); using it-IT`);
  return DEFAULT_LOCALE;
}

function parseSeconds(name, { min, max = 3600, fallback = 60 }) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const seconds = Number(value);
  if (Number.isInteger(seconds) && seconds >= min && seconds <= max) return seconds;
  console.warn(`Ignoring ${name}=${value}: expected an integer ${min}-${max}; using ${fallback}`);
  return fallback;
}

const STYLES = ["disc", "sweets", "journey", "clock"];

function parseStyle(name, fallback) {
  const value = (process.env[name] || "").trim().toLowerCase();
  if (!value) return fallback;
  if (STYLES.includes(value)) return value;
  console.warn(`Ignoring ${name}=${process.env[name]}: expected ${STYLES.join(", ")}; using ${fallback}`);
  return fallback;
}

function parseWebhook(url, secret) {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return { url: parsed.href, secret: secret || "" };
  } catch {
    // invalid URL: fall through to the warning
  }
  console.warn("Ignoring FRAME_SCHEDULE_WEBHOOK_URL: expected an http(s) URL");
  return null;
}
