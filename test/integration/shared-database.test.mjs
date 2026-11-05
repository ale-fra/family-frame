import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiTokenStore } from "../../server/lib/api-tokens.mjs";
import { openDatabase } from "../../server/lib/database.mjs";
import { createScheduleStore } from "../../server/lib/schedule-store.mjs";
import { createSettingsStore } from "../../server/lib/settings-store.mjs";

// The server opens settings.sqlite once and shares the connection between its stores.
describe("shared database connection", () => {
  let tempDir;
  let db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-db-"));
    db = openDatabase(path.join(tempDir, "settings.sqlite"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("is configured once for every store: WAL, busy timeout, foreign keys", () => {
    expect(db.prepare("PRAGMA journal_mode").get().journal_mode).toBe("wal");
    expect(db.prepare("PRAGMA busy_timeout").get().timeout).toBe(2000);
    expect(db.prepare("PRAGMA foreign_keys").get().foreign_keys).toBe(1);
  });

  it("serves the settings, schedule and token stores, which leave it open when closed", async () => {
    const settings = createSettingsStore({ legacySettingsPath: path.join(tempDir, "none.json") }, () => {}, { db });
    const schedule = createScheduleStore({ db, timeZone: "Europe/Rome" });
    const tokens = createApiTokenStore({ db });
    await settings.ensureSettingsDb();
    schedule.ensureSchema();
    tokens.ensureSchema();

    await settings.writeSettings({ slideshow: { pinnedPhotoId: "p1" } });
    schedule.createTimer({ title: "Pasta", durationMs: 60_000 });
    const { token } = tokens.create("home-assistant");

    schedule.close();
    tokens.close();
    expect((await settings.readSettings()).slideshow.pinnedPhotoId).toBe("p1");
    expect(db.prepare("SELECT count(*) AS n FROM timers").get().n).toBe(1);
    expect(createApiTokenStore({ db }).verify(token)).toMatchObject({ name: "home-assistant" });
  });
});
