import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const optimizedWidth = 1440;
const optimizedHeight = 1080;
const optimizedFormat = "webp";
const defaultQuality = 82;
const minQuality = 60;
const maxQuality = 95;

const allowedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

export function createPhotoStore(runtime, settingsStore) {
  async function ensureStorage() {
    await fs.mkdir(runtime.photoDir, { recursive: true });
    await fs.mkdir(runtime.optimizedPhotoDir, { recursive: true });
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

  async function optimizePhoto(id, payload) {
    const db = await readDb();
    const photo = db.photos.find((entry) => entry.id === id);
    if (!photo) throw photoStoreError(404, "Photo not found");

    const mode = payload?.mode;
    if (mode !== "contain" && mode !== "cover") {
      throw photoStoreError(400, "Unsupported optimization mode");
    }

    const quality = normalizeQuality(payload?.quality);
    const sourcePath = path.join(runtime.photoDir, photo.filename);
    await ensureReadableFile(sourcePath);
    await fs.mkdir(runtime.optimizedPhotoDir, { recursive: true });

    const orientedSource = await sharp(sourcePath, { animated: false, pages: 1 })
      .rotate()
      .toBuffer();
    const metadata = await sharp(orientedSource).metadata();
    const sourceWidth = metadata.width || 0;
    const sourceHeight = metadata.height || 0;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw photoStoreError(400, "Unsupported image dimensions");
    }

    const crop = mode === "cover" ? normalizeCrop(payload?.crop, sourceWidth, sourceHeight) : undefined;
    const filename = `${photo.id}.optimized.${optimizedFormat}`;
    const thumbFilename = `${photo.id}.optimized.thumb.${optimizedFormat}`;
    const optimizedPath = path.join(runtime.optimizedPhotoDir, filename);
    const thumbPath = path.join(runtime.optimizedPhotoDir, thumbFilename);

    if (mode === "cover") {
      await sharp(orientedSource)
        .extract(crop)
        .resize(optimizedWidth, optimizedHeight, { fit: "fill" })
        .webp({ quality })
        .toFile(optimizedPath);
    } else {
      const background = await sharp(orientedSource)
        .resize(optimizedWidth, optimizedHeight, { fit: "cover" })
        .blur(36)
        .modulate({ brightness: 1.05, saturation: 1.05 })
        .toBuffer();
      const warmOverlay = await sharp({
        create: {
          width: optimizedWidth,
          height: optimizedHeight,
          channels: 4,
          background: { r: 248, g: 244, b: 235, alpha: 0.34 }
        }
      }).png().toBuffer();
      const foreground = await sharp(orientedSource)
        .resize(optimizedWidth, optimizedHeight, { fit: "inside" })
        .toBuffer();

      await sharp(background)
        .composite([
          { input: warmOverlay, blend: "over" },
          { input: foreground, gravity: "center" }
        ])
        .webp({ quality })
        .toFile(optimizedPath);
    }

    await sharp(optimizedPath)
      .resize(360, 270, { fit: "cover" })
      .webp({ quality: 75 })
      .toFile(thumbPath);

    const now = new Date().toISOString();
    photo.optimized = {
      filename,
      thumbFilename,
      width: optimizedWidth,
      height: optimizedHeight,
      format: optimizedFormat,
      quality,
      mode,
      ...(crop ? { crop } : {}),
      createdAt: photo.optimized?.createdAt || now,
      updatedAt: now,
      sourceUpdatedAt: photo.optimized?.sourceUpdatedAt || photo.createdAt
    };
    photo.optimizedSrc = optimizedMediaUrl(filename, now);
    photo.optimizedThumbSrc = optimizedMediaUrl(thumbFilename, now);
    photo.updatedAt = now;

    await writeDb(db);
    return photo;
  }

  async function removeOptimizedPhoto(id) {
    const db = await readDb();
    const photo = db.photos.find((entry) => entry.id === id);
    if (!photo) throw photoStoreError(404, "Photo not found");

    const filenames = [photo.optimized?.filename, photo.optimized?.thumbFilename].filter(Boolean);
    await Promise.all(filenames.map((filename) => removeFile(path.join(runtime.optimizedPhotoDir, filename))));

    delete photo.optimized;
    delete photo.optimizedSrc;
    delete photo.optimizedThumbSrc;
    photo.updatedAt = new Date().toISOString();
    await writeDb(db);
    return photo;
  }

  return {
    allowedMimeTypes,
    ensureStorage,
    ingestBuffer,
    listPhotos,
    optimizePhoto,
    readDb,
    removeOptimizedPhoto,
    writeDb
  };
}

function normalizeQuality(value) {
  const quality = Number(value);
  if (!Number.isFinite(quality)) return defaultQuality;
  return Math.min(maxQuality, Math.max(minQuality, Math.round(quality)));
}

function normalizeCrop(crop, sourceWidth, sourceHeight) {
  if (!crop || typeof crop !== "object") {
    throw photoStoreError(400, "Crop is required for cover mode");
  }

  const normalized = {
    x: Math.round(Number(crop.x)),
    y: Math.round(Number(crop.y)),
    width: Math.round(Number(crop.width)),
    height: Math.round(Number(crop.height))
  };

  if (
    !Number.isFinite(normalized.x) ||
    !Number.isFinite(normalized.y) ||
    !Number.isFinite(normalized.width) ||
    !Number.isFinite(normalized.height) ||
    normalized.x < 0 ||
    normalized.y < 0 ||
    normalized.width <= 0 ||
    normalized.height <= 0 ||
    normalized.x + normalized.width > sourceWidth ||
    normalized.y + normalized.height > sourceHeight
  ) {
    throw photoStoreError(400, "Crop is outside the source image");
  }

  return normalized;
}

async function ensureReadableFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw photoStoreError(404, "Original file not found");
  }
}

async function removeFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function optimizedMediaUrl(filename, updatedAt) {
  return `/media/photos/optimized/${filename}?v=${encodeURIComponent(updatedAt)}`;
}

function photoStoreError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
