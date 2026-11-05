import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFrameServerApp } from "../../server/lib/app.mjs";

describe("locale exposed to the frame and the admin", () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    const stored = { calendar: { importantKeywords: ["scuola"] } };
    const app = createFrameServerApp({
      runtime: { adminPin: "", locale: "en-GB", language: "en", timeZone: "Europe/London", apiDocs: false, distDir: "/nonexistent", photoDir: "/nonexistent" },
      calendarService: {},
      clientLog: {},
      photoStore: {},
      settingsStore: {
        readPublicSettings: async () => stored,
        readSettings: async () => stored,
        writeSettings: async () => {}
      },
      systemActions: {}
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("adds the read-only i18n block to public and admin settings", async () => {
    for (const url of ["/api/settings", "/api/admin/settings"]) {
      expect(await (await fetch(baseUrl + url)).json()).toEqual({
        calendar: { importantKeywords: ["scuola"] },
        i18n: { locale: "en-GB", language: "en", timeZone: "Europe/London" }
      });
    }
  });

  it("ignores an i18n block sent back in a settings update", async () => {
    const response = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ i18n: { locale: "fr-FR" }, slideshow: { pinnedPhotoId: "" } })
    });
    expect(response.status).toBe(200);
    expect((await response.json()).i18n).toEqual({ locale: "en-GB", language: "en", timeZone: "Europe/London" });
  });
});
