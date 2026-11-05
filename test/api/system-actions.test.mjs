import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFrameServerApp } from "../../server/lib/app.mjs";
import { createSystemActions } from "../../server/lib/system-actions.mjs";

describe("portable device boundary", () => {
  let directory, server, url, settings, writes;
  async function start(systemActions = createSystemActions()) {
    const app = createFrameServerApp({
      runtime: { adminPin: "demo-test-pin", distDir: directory, photoDir: directory },
      calendarService: {}, clientLog: {}, photoStore: {}, systemActions,
      settingsStore: {
        readSettings: async () => settings,
        readPublicSettings: async () => settings,
        writeSettings: async (next) => { settings = next; writes.push(next); }
      }
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    url = `http://127.0.0.1:${server.address().port}`;
  }
  function request(endpoint, method = "GET", body) {
    return fetch(url + endpoint, {
      method,
      headers: { "x-frame-admin-pin": "demo-test-pin", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  }
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-portable-"));
    settings = {}; writes = [];
  });
  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    server = undefined;
    await fs.rm(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("advertises no device operations and keeps capabilities behind admin authentication", async () => {
    await start();
    expect((await fetch(url + "/api/admin/capabilities")).status).toBe(401);
    expect(await (await request("/api/admin/capabilities")).json()).toEqual({
      displayPower: false, nightDisplay: false, refresh: false
    });
    expect((await fetch(url + "/api/health")).status).toBe(200);
  });

  it("returns 501 for device actions without saving night settings, while ordinary settings still save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await start();
    for (const action of ["on", "off"]) {
      expect((await request(`/api/admin/display/${action}`, "POST", {})).status).toBe(501);
    }
    expect((await request("/api/admin/refresh", "POST", {})).status).toBe(501);
    expect((await request("/api/admin/settings", "PUT", {
      display: { nightMode: { enabled: true, offTime: "23:00", onTime: "07:00", output: "demo-output" } }
    })).status).toBe(501);
    expect(writes).toHaveLength(0);
    expect((await request("/api/admin/settings", "PUT", {
      calendar: { importantKeywords: ["demo"] }
    })).status).toBe(200);
    expect(settings.calendar.importantKeywords).toEqual(["demo"]);
  });

  it("delegates device operations only to the injected adapter", async () => {
    const actions = {
      capabilities: { displayPower: true, nightDisplay: true, refresh: true },
      setDisplayPower: vi.fn(async () => {}),
      applyNightDisplaySettings: vi.fn(async () => {}),
      triggerRefresh: vi.fn(async () => true)
    };
    await start(actions);
    expect(await (await request("/api/admin/capabilities")).json()).toEqual(actions.capabilities);
    expect((await request("/api/admin/display/off", "POST", { output: "demo-output" })).status).toBe(200);
    expect(actions.setDisplayPower).toHaveBeenCalledWith("off", "demo-output");
    expect((await request("/api/admin/refresh", "POST", {})).status).toBe(202);
    expect(actions.triggerRefresh).toHaveBeenCalledWith("admin-api");
  });
});
