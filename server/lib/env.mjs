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
    refreshScript: process.env.FRAME_REFRESH_SCRIPT
      ? path.resolve(process.env.FRAME_REFRESH_SCRIPT)
      : path.join(rootDir, "scripts", "remote-refresh.sh"),
    nightDisplayScript: process.env.FRAME_NIGHT_DISPLAY_SCRIPT
      ? path.resolve(process.env.FRAME_NIGHT_DISPLAY_SCRIPT)
      : path.join(rootDir, "scripts", "install-night-display.sh"),
    port: Number(process.env.FRAME_PHOTO_SERVER_PORT || 8787),
    adminPin: process.env.FRAME_ADMIN_PIN || "",
    telegramToken: process.env.FRAME_TELEGRAM_BOT_TOKEN || "",
    calendarIcsUrl: process.env.FRAME_CALENDAR_ICS_URL || "",
    calendarSourcesFile,
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
