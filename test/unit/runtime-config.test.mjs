import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeConfig } from "../../server/lib/env.mjs";

const VARIABLES = [
  "FRAME_LOCALE",
  "FRAME_ROUTINE_AUTO_DISMISS_SECONDS",
  "FRAME_TIMER_AUTO_DISMISS_SECONDS",
  "FRAME_SCHEDULE_WEBHOOK_URL",
  "FRAME_SCHEDULE_WEBHOOK_SECRET",
  "FRAME_TIMER_STYLE",
  "FRAME_ROUTINE_STYLE",
  "FRAME_SERVER_PORT",
  "FRAME_PHOTO_SERVER_PORT"
];

describe("runtime configuration from the environment", () => {
  let saved;
  let warn;

  beforeEach(() => {
    saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
    for (const name of VARIABLES) delete process.env[name];
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    warn.mockRestore();
  });

  const config = (env) => {
    Object.assign(process.env, env);
    return createRuntimeConfig();
  };

  describe("FRAME_SERVER_PORT", () => {
    it("defaults to 8787 and is configurable", () => {
      expect(config({}).port).toBe(8787);
      expect(config({ FRAME_SERVER_PORT: "9000" }).port).toBe(9000);
    });

    it("continues to accept the old port and gives the new variable precedence", () => {
      expect(config({ FRAME_PHOTO_SERVER_PORT: "9000" }).port).toBe(9000);
      expect(config({ FRAME_SERVER_PORT: "0" }).port).toBe(0);
    });

    it.each(["-1", "65536", "broken"])("rejects invalid ports (%s)", (port) => {
      expect(() => config({ FRAME_SERVER_PORT: port })).toThrow(/FRAME_SERVER_PORT.*65535/);
    });
  });

  describe("FRAME_LOCALE", () => {
    it("defaults to Italian", () => {
      expect(config({})).toMatchObject({ locale: "it-IT", language: "it" });
    });

    it.each([
      ["en", "en", "en"],
      ["en-GB", "en-GB", "en"],
      ["en-us", "en-US", "en"],
      ["it", "it", "it"],
      [" it-IT ", "it-IT", "it"]
    ])("accepts %j as locale %s (language %s)", (value, locale, language) => {
      expect(config({ FRAME_LOCALE: value })).toMatchObject({ locale, language });
      expect(warn).not.toHaveBeenCalled();
    });

    it.each(["fr-FR", "xx", "not a locale", "en_GB"])("falls back to it-IT for %j with a warning", (value) => {
      expect(config({ FRAME_LOCALE: value })).toMatchObject({ locale: "it-IT", language: "it" });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("FRAME_LOCALE"));
    });
  });

  describe("ring windows", () => {
    it("default to 60 seconds", () => {
      expect(config({})).toMatchObject({ timerAutoDismissMs: 60_000, routineAutoDismissMs: 60_000 });
    });

    it("are configurable", () => {
      expect(config({ FRAME_TIMER_AUTO_DISMISS_SECONDS: "0", FRAME_ROUTINE_AUTO_DISMISS_SECONDS: "120" }))
        .toMatchObject({ timerAutoDismissMs: 0, routineAutoDismissMs: 120_000 });
    });

    it("reject out-of-range values with a warning (routines need at least 1 s)", () => {
      expect(config({ FRAME_ROUTINE_AUTO_DISMISS_SECONDS: "0", FRAME_TIMER_AUTO_DISMISS_SECONDS: "abc" }))
        .toMatchObject({ timerAutoDismissMs: 60_000, routineAutoDismissMs: 60_000 });
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });

  describe("display styles", () => {
    it("default to the time disc for timers and the clock for routines", () => {
      expect(config({})).toMatchObject({ timerStyle: "disc", routineStyle: "clock" });
    });

    it("are configurable", () => {
      expect(config({ FRAME_TIMER_STYLE: "sweets", FRAME_ROUTINE_STYLE: " Journey " }))
        .toMatchObject({ timerStyle: "sweets", routineStyle: "journey" });
    });

    it("fall back to the defaults with a warning", () => {
      expect(config({ FRAME_TIMER_STYLE: "hourglass" })).toMatchObject({ timerStyle: "disc" });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("FRAME_TIMER_STYLE"));
    });
  });

  describe("FRAME_SCHEDULE_WEBHOOK_URL", () => {
    it("is off by default", () => {
      expect(config({}).scheduleWebhook).toBeNull();
    });

    it("accepts http(s) URLs and an optional secret", () => {
      expect(config({
        FRAME_SCHEDULE_WEBHOOK_URL: "http://homeassistant.local:8123/api/webhook/frame",
        FRAME_SCHEDULE_WEBHOOK_SECRET: "s3cret"
      }).scheduleWebhook).toEqual({ url: "http://homeassistant.local:8123/api/webhook/frame", secret: "s3cret" });
    });

    it.each(["ftp://example.com/hook", "not a url", "file:///etc/passwd"])("ignores %j with a warning", (value) => {
      expect(config({ FRAME_SCHEDULE_WEBHOOK_URL: value }).scheduleWebhook).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("FRAME_SCHEDULE_WEBHOOK_URL"));
    });
  });
});
