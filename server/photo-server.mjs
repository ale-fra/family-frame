import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import express from "express";
import multer from "multer";

const rootDir = process.cwd();
const dataDir = process.env.FRAME_DATA_DIR ? path.resolve(process.env.FRAME_DATA_DIR) : path.join(rootDir, "data");
const photoDir = path.join(dataDir, "photos");
const trashDir = path.join(dataDir, "trash");
const dbPath = path.join(dataDir, "photos.json");
const distDir = path.join(rootDir, "dist");
const indexPath = path.join(distDir, "index.html");
const refreshScript = process.env.FRAME_REFRESH_SCRIPT
  ? path.resolve(process.env.FRAME_REFRESH_SCRIPT)
  : path.join(rootDir, "scripts", "remote-refresh.sh");
const port = Number(process.env.FRAME_PHOTO_SERVER_PORT || 8787);
const adminPin = process.env.FRAME_ADMIN_PIN || "";
const telegramToken = process.env.FRAME_TELEGRAM_BOT_TOKEN || "";
const allowedTelegramChats = new Set(
  (process.env.FRAME_TELEGRAM_ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

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

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
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
