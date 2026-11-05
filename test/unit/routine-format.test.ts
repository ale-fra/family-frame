import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  describeRoutine,
  emptyRoutineForm,
  formToPayload,
  formatLocalDate,
  formatNextOccurrence,
  formatOccurrenceDay,
  routineToForm
} from "../../src/admin/routines/routineFormat";
import { routineMessages } from "../../src/admin/routines/messages";
import type { Routine } from "../../src/admin/routines/routineFormat";

const weekdays = ["mon", "tue", "wed", "thu", "fri"] as const;

describe("routine summaries", () => {
  it("says common weekly patterns in words", () => {
    expect(describeRecurrence({ frequency: "weekly", interval: 1, weekdays: [...weekdays] }, "it")).toBe("Dal lunedì al venerdì");
    expect(describeRecurrence({ frequency: "weekly", interval: 1, weekdays: [...weekdays] }, "en")).toBe("Monday to Friday");
    expect(describeRecurrence({ frequency: "weekly", interval: 1, weekdays: ["sat", "sun"] }, "en")).toBe("Weekends");
    expect(describeRecurrence({ frequency: "weekly", interval: 1, weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }, "it")).toBe("Tutti i giorni");
    expect(describeRecurrence({ frequency: "weekly", interval: 1, weekdays: ["mon", "wed"] }, "en")).toBe("Every Mon, Wed");
    expect(describeRecurrence({ frequency: "weekly", interval: 2, weekdays: ["tue"] }, "it")).toBe("Ogni 2 settimane: mar");
  });

  it("says daily and monthly patterns in words", () => {
    expect(describeRecurrence({ frequency: "daily", interval: 1 }, "en")).toBe("Every day");
    expect(describeRecurrence({ frequency: "daily", interval: 3 }, "it")).toBe("Ogni 3 giorni");
    expect(describeRecurrence({ frequency: "monthly", interval: 1, monthDay: 15 }, "en")).toBe("Every month on day 15");
    expect(describeRecurrence({ frequency: "monthly", interval: 1, monthDay: 31 }, "it")).toBe("Ogni mese, l'ultimo giorno");
    expect(describeRecurrence({ frequency: "monthly", interval: 2, monthDay: 1 }, "en")).toBe("Every 2 months on day 1");
  });

  it("adds the time and the notice", () => {
    const routine = { time: "08:10", noticeMinutes: 15, recurrence: { frequency: "weekly", interval: 1, weekdays: [...weekdays] } } as Routine;
    expect(describeRoutine(routine, "it")).toBe("Dal lunedì al venerdì alle 08:10 · avviso 15 min prima");
    expect(describeRoutine({ ...routine, noticeMinutes: 0 }, "en")).toBe("Monday to Friday at 08:10 · no advance notice");
  });

  it("tells when the next occurrence is, relative to today", () => {
    const now = Date.parse("2025-09-15T05:00:00Z"); // Monday 07:00 in Rome
    const i18n = { locale: "it-IT", timeZone: "Europe/Rome" };
    expect(formatNextOccurrence("2025-09-15T06:10:00.000Z", now, i18n, "it")).toBe("oggi alle 08:10");
    expect(formatNextOccurrence("2025-09-16T06:10:00.000Z", now, i18n, "it")).toBe("domani alle 08:10");
    expect(formatNextOccurrence("2025-09-19T06:10:00.000Z", now, { locale: "en-GB", timeZone: "Europe/Rome" }, "en"))
      .toBe("Fri 19 Sept at 08:10");
  });
});

describe("dates in the routine list", () => {
  const now = Date.parse("2025-09-15T05:00:00Z"); // Monday 07:00 in Rome
  const rome = { locale: "it-IT", timeZone: "Europe/Rome" };

  it("labels an occurrence by its local date and the routine's time", () => {
    expect(formatOccurrenceDay("2025-09-15", "08:10", now, rome, "it")).toBe("oggi alle 08:10");
    expect(formatOccurrenceDay("2025-09-16", "08:10", now, rome, "it")).toBe("domani alle 08:10");
    expect(formatOccurrenceDay("2025-09-18", "08:10", now, rome, "it")).toBe("gio 18 set alle 08:10");
    expect(formatOccurrenceDay("2025-09-18", "08:10", now, { locale: "en-GB", timeZone: "Europe/Rome" }, "en")).toBe("Thu 18 Sept at 08:10");
  });

  it("writes a plain local date without shifting it", () => {
    expect(formatLocalDate("2025-09-22", { locale: "it-IT", timeZone: "America/Los_Angeles" })).toBe("lun 22 set");
  });
});

describe("routine form", () => {
  it("starts with friendly defaults: weekdays at 08:00, 15 min notice, 1 min on screen", () => {
    expect(emptyRoutineForm("2025-09-15")).toEqual({
      title: "", time: "08:00", frequency: "weekly", interval: 1, weekdays: [...weekdays], monthDay: 1,
      startDate: "2025-09-15", endDate: "", noticeMinutes: 15, autoDismissMs: 60_000, style: "clock", icon: null
    });
  });

  it("turns the form into the API payload, keeping only the fields of the chosen frequency", () => {
    const form = { ...emptyRoutineForm("2025-09-15"), title: "  School run ", time: "08:10", icon: "backpack" };
    expect(formToPayload(form)).toEqual({
      title: "School run", time: "08:10", recurrence: { frequency: "weekly", interval: 1, weekdays: [...weekdays] },
      startDate: "2025-09-15", endDate: null, noticeMinutes: 15, autoDismissMs: 60_000, style: "clock", icon: "backpack"
    });
    expect(formToPayload({ ...form, frequency: "monthly", monthDay: 31, endDate: "2026-06-30" })).toMatchObject({
      recurrence: { frequency: "monthly", interval: 1, monthDay: 31 }, endDate: "2026-06-30"
    });
    expect(formToPayload({ ...form, frequency: "daily", interval: 2 }).recurrence).toEqual({ frequency: "daily", interval: 2 });
  });

  it("orders weekdays Monday first whatever order they were clicked in", () => {
    const form = { ...emptyRoutineForm("2025-09-15"), title: "x", weekdays: ["sun", "mon"] as const };
    expect(formToPayload({ ...form, weekdays: [...form.weekdays] }).recurrence).toMatchObject({ weekdays: ["mon", "sun"] });
  });

  it("round-trips an existing routine", () => {
    const routine = {
      title: "Swimming", time: "17:30", recurrence: { frequency: "weekly", interval: 2, weekdays: ["tue"] },
      startDate: "2025-09-16", endDate: null, noticeMinutes: 30, autoDismissMs: 120_000, style: "disc", icon: "sport"
    } as Routine;
    const form = routineToForm(routine);
    expect(form).toMatchObject({ frequency: "weekly", interval: 2, weekdays: ["tue"], endDate: "", monthDay: 1 });
    expect(formToPayload(form)).toEqual({ ...routine });
  });
});

describe("routine messages", () => {
  it("has the same texts in Italian and English", () => {
    expect(Object.keys(routineMessages("en")).sort()).toEqual(Object.keys(routineMessages("it")).sort());
  });
});
