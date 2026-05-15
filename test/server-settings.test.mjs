import { describe, expect, it } from "vitest";
import {
  enabledCalendarSources,
  mergeSettings,
  normalizeCalendarSources,
  normalizeSettings
} from "../server/lib/settings-utils.mjs";

describe("server settings normalization", () => {
  it("normalizes calendar sources and removes duplicate URLs", () => {
    const sources = normalizeCalendarSources([
      { label: " Famiglia ", icsUrl: " https://example.com/family.ics " },
      { label: "Duplicate", icsUrl: "https://example.com/family.ics" },
      { label: "", icsUrl: "" }
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      label: "Famiglia",
      icsUrl: "https://example.com/family.ics",
      enabled: true
    });
    expect(sources[0].id).toMatch(/^famiglia-/);
  });

  it("keeps only enabled calendar sources for public/proxy use", () => {
    expect(enabledCalendarSources([
      { label: "A", icsUrl: "https://a.test", enabled: true },
      { label: "B", icsUrl: "https://b.test", enabled: false }
    ])).toHaveLength(1);
  });

  it("accepts display and pinned photo settings", () => {
    const settings = normalizeSettings({
      display: {
        nightMode: {
          enabled: true,
          offTime: "23:00",
          onTime: "07:00",
          output: "DVI-I-1-1"
        }
      },
      slideshow: {
        pinnedPhotoId: "photo-1"
      }
    });

    expect(settings).toEqual({
      display: {
        nightMode: {
          enabled: true,
          offTime: "23:00",
          onTime: "07:00",
          output: "DVI-I-1-1"
        }
      },
      slideshow: {
        pinnedPhotoId: "photo-1"
      }
    });
  });

  it("deep merges settings sections", () => {
    expect(mergeSettings(
      { calendar: { importantKeywords: ["a"] }, slideshow: { pinnedPhotoId: "old" } },
      { calendar: { sources: [] }, slideshow: { pinnedPhotoId: "new" } }
    )).toEqual({
      calendar: { importantKeywords: ["a"], sources: [] },
      display: {},
      slideshow: { pinnedPhotoId: "new" },
      specialDays: {}
    });
  });
});
