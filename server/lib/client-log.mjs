import fs from "node:fs/promises";

export function createClientLog(runtime) {
  function normalizeClientLogEntry(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const event = sanitizeLogString(payload.event, 80);
    if (!event) return null;

    return {
      timestamp: new Date().toISOString(),
      event,
      path: sanitizeLogString(payload.path, 160),
      userAgent: sanitizeLogString(payload.userAgent, 220),
      details: sanitizeLogDetails(payload.details)
    };
  }

  async function appendClientLog(entry) {
    await fs.mkdir(runtime.dataDir, { recursive: true });
    await rotateClientLogIfNeeded();
    await fs.appendFile(runtime.clientLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async function rotateClientLogIfNeeded() {
    try {
      const stats = await fs.stat(runtime.clientLogPath);
      if (stats.size < runtime.maxClientLogBytes) return;
      await fs.rename(runtime.clientLogPath, `${runtime.clientLogPath}.1`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return {
    appendClientLog,
    normalizeClientLogEntry
  };
}

function sanitizeLogDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(details).slice(0, 30)) {
    const safeKey = sanitizeLogString(key, 60);
    if (!safeKey) continue;
    if (typeof value === "string") sanitized[safeKey] = sanitizeLogString(value, 500);
    else if (typeof value === "number" && Number.isFinite(value)) sanitized[safeKey] = value;
    else if (typeof value === "boolean") sanitized[safeKey] = value;
    else if (value === null) sanitized[safeKey] = null;
  }
  return sanitized;
}

function sanitizeLogString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]/g, " ").slice(0, maxLength);
}
