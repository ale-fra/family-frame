import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const allowedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

export function createPhotoStore(runtime, settingsStore) {
  async function ensureStorage() {
    await fs.mkdir(runtime.photoDir, { recursive: true });
    await fs.mkdir(runtime.trashDir, { recursive: true });
    await settingsStore.ensureSettingsDb();
    try {
      await fs.access(runtime.dbPath);
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
      const text = await fs.readFile(runtime.dbPath, "utf8");
      const parsed = JSON.parse(text);
      return { photos: Array.isArray(parsed.photos) ? parsed.photos : [] };
    } catch {
      return { photos: [] };
    }
  }

  async function writeDb(db) {
    await fs.mkdir(runtime.dataDir, { recursive: true });
    const tmpPath = `${runtime.dbPath}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
    await fs.rename(tmpPath, runtime.dbPath);
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
    const filePath = path.join(runtime.photoDir, filename);
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

  return {
    allowedMimeTypes,
    ensureStorage,
    ingestBuffer,
    listPhotos,
    readDb,
    writeDb
  };
}
