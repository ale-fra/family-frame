import { describe, expect, it } from "vitest";
import { defaultConfig, mergeConfig } from "../../src/lib/config";

describe("mergeConfig", () => {
  it("applies settings calendar keywords over file config", () => {
    const config = mergeConfig(
      {
        calendar: {
          ...defaultConfig.calendar,
          importantKeywords: ["file"]
        }
      },
      {
        calendar: {
          importantKeywords: ["settings"]
        }
      }
    );

    expect(config.calendar.importantKeywords).toEqual(["settings"]);
  });

  it("takes the locale and time zone from the server (FRAME_LOCALE, FRAME_TIMEZONE)", () => {
    expect(mergeConfig({}, {}).i18n).toEqual({ locale: "it-IT" });
    expect(mergeConfig({}, { i18n: { locale: "en-GB", language: "en", timeZone: "Europe/London" } }).i18n)
      .toEqual({ locale: "en-GB", language: "en", timeZone: "Europe/London" });
  });

  it("keeps pinned photo ids from runtime settings", () => {
    const config = mergeConfig({}, {
      slideshow: {
        pinnedPhotoId: "photo-1"
      }
    });

    expect(config.slideshow.pinnedPhotoId).toBe("photo-1");
  });

  it("disables special days listed by settings", () => {
    const config = mergeConfig({}, {
      specialDays: {
        disabledIds: ["natale"]
      }
    });

    expect(config.specialDays.events.find((event) => event.id === "natale")?.enabled).toBe(false);
  });
});
