import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createPhotoServerApp } from "../server/lib/app.mjs";
import { createPhotoStore } from "../server/lib/photos.mjs";

describe("photo optimization API", () => {
  let tempDir;
  let runtime;
  let photoStore;
  let server;
  let baseUrl;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-photo-test-"));
    runtime = {
      adminPin: "1234",
      dataDir: tempDir,
      photoDir: path.join(tempDir, "photos"),
      optimizedPhotoDir: path.join(tempDir, "photos", "optimized"),
      trashDir: path.join(tempDir, "trash"),
      dbPath: path.join(tempDir, "photos.json"),
      distDir: path.join(tempDir, "dist"),
      indexPath: path.join(tempDir, "dist", "index.html")
    };
    const settingsStore = {
      ensureSettingsDb: async () => {},
      readCalendarSourcesFromSettings: async () => [],
      readPublicSettings: async () => ({}),
      readSettings: async () => ({}),
      writeSettings: async () => {},
      clearPinnedPhotoIfNeeded: async () => {}
    };
    photoStore = createPhotoStore(runtime, settingsStore);
    await photoStore.ensureStorage();

    const app = createPhotoServerApp({
      runtime,
      calendarService: {
        fetchCalendarIcs: async () => "",
        fetchCachedRemoteCalendar: async () => ""
      },
      clientLog: {
        normalizeClientLogEntry: () => null,
        appendClientLog: async () => {}
      },
      photoStore,
      settingsStore,
      systemActions: {
        triggerRefresh: async () => true,
        applyNightDisplaySettings: async () => {},
        setDisplayPower: async () => {}
      }
    });

    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("generates and removes an optimized WebP derivative", async () => {
    const photo = await ingestTestPhoto(photoStore);

    const optimizeResponse = await adminFetch(`/api/admin/photos/${photo.id}/optimize`, {
      method: "POST",
      body: JSON.stringify({ mode: "contain", quality: 82 })
    });
    expect(optimizeResponse.status).toBe(200);

    const optimizePayload = await optimizeResponse.json();
    expect(optimizePayload.photo.optimized).toMatchObject({
      width: 1440,
      height: 1080,
      format: "webp",
      quality: 82,
      mode: "contain"
    });
    expect(optimizePayload.photo.optimizedSrc).toContain("/media/photos/optimized/");

    const optimizedPath = path.join(runtime.optimizedPhotoDir, optimizePayload.photo.optimized.filename);
    const optimizedMetadata = await sharp(optimizedPath).metadata();
    expect(optimizedMetadata.width).toBe(1440);
    expect(optimizedMetadata.height).toBe(1080);
    expect(optimizedMetadata.format).toBe("webp");

    const deleteResponse = await adminFetch(`/api/admin/photos/${photo.id}/optimize`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(200);
    const deletePayload = await deleteResponse.json();
    expect(deletePayload.photo.optimized).toBeUndefined();
    await expect(fs.access(optimizedPath)).rejects.toThrow();
  });

  it("rejects crop rectangles outside the source image", async () => {
    const photo = await ingestTestPhoto(photoStore);
    const response = await adminFetch(`/api/admin/photos/${photo.id}/optimize`, {
      method: "POST",
      body: JSON.stringify({
        mode: "cover",
        quality: 82,
        crop: { x: 1900, y: 0, width: 300, height: 300 }
      })
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 for unknown photos", async () => {
    const response = await adminFetch("/api/admin/photos/missing/optimize", {
      method: "POST",
      body: JSON.stringify({ mode: "contain", quality: 82 })
    });

    expect(response.status).toBe(404);
  });

  async function adminFetch(route, init = {}) {
    return fetch(`${baseUrl}${route}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-frame-admin-pin": runtime.adminPin,
        ...(init.headers || {})
      }
    });
  }
});

async function ingestTestPhoto(photoStore) {
  const buffer = await sharp({
    create: {
      width: 2000,
      height: 1500,
      channels: 3,
      background: "#cc7755"
    }
  }).jpeg().toBuffer();
  const result = await photoStore.ingestBuffer(buffer, {
    originalName: "family.jpg",
    mimeType: "image/jpeg",
    source: "web"
  });
  return result.photo;
}
