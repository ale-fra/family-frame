import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiTokenStore } from "../../server/lib/api-tokens.mjs";
import { createFrameServerApp } from "../../server/lib/app.mjs";

const PIN = "482913";

describe("admin endpoints", () => {
  let tempDir;
  let tokens;
  let server;
  let baseUrl;
  let token;
  let scheduleToken;

  async function start(runtime) {
    const app = createFrameServerApp({
      runtime: { distDir: "/nonexistent", photoDir: "/nonexistent", apiDocs: false, ...runtime },
      calendarService: {},
      clientLog: {},
      photoStore: {},
      settingsStore: {},
      systemActions: { capabilities: { displayPower: false, nightDisplay: false, refresh: false } },
      scheduleStore: { listTimers: () => [], listRoutines: () => [] },
      apiTokens: tokens
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  const get = (headers = {}, url = "/api/admin/capabilities") => fetch(baseUrl + url, { headers });
  const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-auth-"));
    tokens = createApiTokenStore({ dbPath: path.join(tempDir, "settings.sqlite") });
    tokens.ensureSchema();
    token = tokens.create("automation", "admin").token;
    scheduleToken = tokens.create("home-assistant").token;
  });

  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    server = null;
    tokens.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("with a PIN", () => {
    beforeEach(() => start({ adminPin: PIN }));

    it("accepts the PIN header, as today", async () => {
      expect((await get({ "x-frame-admin-pin": PIN })).status).toBe(200);
    });

    it("accepts a Bearer token", async () => {
      expect((await get({ authorization: `Bearer ${token}` })).status).toBe(200);
      expect((await get({ authorization: `bearer ${token}` })).status).toBe(200);
    });

    it("accepts the token as the Basic password, for tools that only support Basic", async () => {
      expect((await get({ authorization: basic("anything", token) })).status).toBe(200);
      expect((await get({ authorization: basic("", token) })).status).toBe(200);
      expect((await get({ authorization: basic("admin", PIN) })).status).toBe(401); // Basic carries tokens only
    });

    it("rejects wrong, missing and revoked credentials", async () => {
      for (const headers of [{}, { "x-frame-admin-pin": "000000" }, { authorization: "Bearer ff_wrong" }, { authorization: "Token abc" }]) {
        const response = await get(headers);
        expect(response.status, JSON.stringify(headers)).toBe(401);
        expect(await response.json()).toEqual({ error: "Admin PIN or API token required" });
      }
      tokens.revoke("automation");
      expect((await get({ authorization: `Bearer ${token}` })).status).toBe(401);
    });

    describe("token scopes", () => {
      const bearer = (value) => ({ authorization: `Bearer ${value}` });

      it("lets schedule tokens manage timers and routines only", async () => {
        expect((await get(bearer(scheduleToken), "/api/admin/timers")).status).toBe(200);
        expect((await get(bearer(scheduleToken), "/api/admin/routines")).status).toBe(200);
        const denied = await get(bearer(scheduleToken));
        expect(denied.status).toBe(403);
        expect(await denied.json()).toEqual({
          error: "This API token is limited to timers and routines",
          code: "insufficient-scope"
        });
      });

      it("lets admin tokens and the PIN reach everything", async () => {
        for (const headers of [bearer(token), { "x-frame-admin-pin": PIN }]) {
          expect((await get(headers, "/api/admin/timers")).status).toBe(200);
          expect((await get(headers)).status).toBe(200);
        }
      });

      it("does not count a valid token used beyond its scope as a wrong attempt", async () => {
        for (let i = 0; i < 15; i += 1) expect((await get(bearer(scheduleToken))).status).toBe(403);
        expect((await get({ "x-frame-admin-pin": PIN })).status).toBe(200);
      });
    });

    it("never asks the browser for a password (so browsers never send credentials by themselves)", async () => {
      const response = await get();
      expect(response.headers.get("www-authenticate")).toBe('Bearer realm="family-frame"');
    });

    it("blocks a device after 10 wrong attempts, even with the right PIN, and says when to retry", async () => {
      for (let i = 0; i < 10; i += 1) expect((await get({ "x-frame-admin-pin": `00000${i}` })).status).toBe(401);
      const blocked = await get({ "x-frame-admin-pin": PIN });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(800);
      expect(await blocked.json()).toEqual({
        error: expect.stringMatching(/Too many wrong attempts/),
        code: "too-many-attempts"
      });
    });

    it("does not count requests without credentials as attempts", async () => {
      for (let i = 0; i < 20; i += 1) await get();
      expect((await get({ "x-frame-admin-pin": PIN })).status).toBe(200);
    });
  });

  describe("without a PIN", () => {
    beforeEach(() => start({ adminPin: "" }));

    it("stays open, as decided, even when tokens exist", async () => {
      expect((await get()).status).toBe(200);
      expect((await get({ authorization: "Bearer ff_wrong" })).status).toBe(200);
    });
  });
});
