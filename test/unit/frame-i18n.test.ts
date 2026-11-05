import { describe, expect, it } from "vitest";
import { frameMessages } from "../../src/frame/lib/i18n";

describe("frame messages", () => {
  it("has the same texts in Italian and English", () => {
    expect(Object.keys(frameMessages("en")).sort()).toEqual(Object.keys(frameMessages("it")).sort());
  });

  it("picks the language from FRAME_LOCALE, Italian by default", () => {
    expect(frameMessages("en").timeUp).toBe("Time's up!");
    expect(frameMessages("it").timeUp).toBe("Tempo scaduto!");
    expect(frameMessages(undefined).timeUp).toBe("Tempo scaduto!");
    expect(frameMessages("fr").timeUp).toBe("Tempo scaduto!");
  });

  it("words counts and times naturally", () => {
    expect(frameMessages("it").more(1)).toBe("+1 altro");
    expect(frameMessages("it").more(2)).toBe("+2 altri");
    expect(frameMessages("en").more(2)).toBe("+2 more");
    expect(frameMessages("it").dueAt("08:10")).toBe("alle 08:10");
    expect(frameMessages("en").dueAt("08:10")).toBe("at 08:10");
  });
});
