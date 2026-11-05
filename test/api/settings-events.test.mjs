import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFrameServerApp } from "../../server/lib/app.mjs";
import { createSettingsStore } from "../../server/lib/settings-store.mjs";

// /api/events is public (the frame has no credentials), so it must only carry public data.
const PRIVATE_FEED = "https://calendar.example.com/private/SECRET-TOKEN/basic.ics";

describe("settings broadcast on the public event stream", () => {
  let tempDir;
  let server;
  let baseUrl;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-settings-events-"));
    const settingsStore = createSettingsStore({
      settingsDbPath: path.join(tempDir, "settings.sqlite"),
      legacySettingsPath: path.join(tempDir, "none.json")
    });
    await settingsStore.ensureSettingsDb();
    const app = createFrameServerApp({
      runtime: { adminPin: "", apiDocs: false, distDir: "/nonexistent", photoDir: "/nonexistent" },
      calendarService: {},
      clientLog: {},
      photoStore: {},
      settingsStore,
      systemActions: {}
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("never sends private calendar feed URLs, only the proxy URLs", async () => {
    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
    const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
    let received = "";
    while (!received.includes('"connected"')) received += (await reader.read()).value;

    const saved = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ calendar: { sources: [{ label: "Family", icsUrl: PRIVATE_FEED }] } })
    });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(await saved.json())).toContain(PRIVATE_FEED); // the admin still sees it

    while (!received.includes('"type":"settings"')) received += (await reader.read()).value;
    controller.abort();
    expect(received).not.toContain("SECRET-TOKEN");
    expect(received).toContain("/api/calendars/1.ics");
  });
});
