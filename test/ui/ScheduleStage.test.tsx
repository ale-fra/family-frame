import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleStage } from "../../src/frame/components/ScheduleStage";
import type { PublicSchedule } from "../../src/frame/lib/scheduleDisplay";
import { MINUTE, occurrence, schedule, timer } from "../helpers/schedule-fixtures";

// Thursday 4 December 2025, 07:58 in Rome.
const NOW = Date.parse("2025-12-04T06:58:00Z");
const ROME = { locale: "it-IT", timeZone: "Europe/Rome" };
const LONDON = { locale: "en-GB", language: "en", timeZone: "Europe/London" };

describe("ScheduleStage", () => {
  let onActiveChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "Date"] });
    onActiveChange = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function show(data: PublicSchedule | null, i18n: { locale: string; language?: string; timeZone?: string } = ROME) {
    return render(<ScheduleStage schedule={data} serverNow={() => Date.now()} i18n={i18n} onActiveChange={onActiveChange} />);
  }
  const cards = () => Array.from(document.querySelectorAll<HTMLElement>(".schedule-card"));
  const remaining = (card: HTMLElement = cards()[0]) => card.querySelector(".schedule-remaining")?.textContent;
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it("shows nothing, and lets the photos through, while nothing is scheduled", () => {
    show(schedule(NOW));
    expect(document.querySelector(".schedule-stage")).toBeNull();
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
    show(null);
    expect(document.querySelector(".schedule-stage")).toBeNull();
  });

  it("takes over the photo area with a running timer", () => {
    show(schedule(NOW, [timer(NOW, { remainingMs: 7 * MINUTE })]));
    expect(screen.getByRole("region", { name: "Timer e appuntamenti" })).toBeTruthy();
    expect(cards()).toHaveLength(1);
    expect(cards()[0].dataset.style).toBe("disc");
    expect(screen.getByText("Pasta pronta")).toBeTruthy();
    expect(remaining()).toBe("7min");
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
  });

  it("counts down every second, in seconds during the last minute", () => {
    show(schedule(NOW, [timer(NOW, { remainingMs: 61_000 })]));
    expect(remaining()).toBe("2min");
    tick(1_000);
    expect(remaining()).toBe("1min");
    tick(1_000);
    expect(remaining()).toBe("59s");
    expect(cards()[0].classList.contains("phase-soon")).toBe(true);
  });

  it("rings at the deadline in the frame's language, then leaves the frame", () => {
    show(schedule(NOW, [timer(NOW, { title: "Pasta is ready", remainingMs: 2_000 })]), LONDON);
    tick(2_000);
    expect(cards()[0].classList.contains("phase-ringing")).toBe(true);
    expect(screen.getByText("Time's up!")).toBeTruthy();
    tick(MINUTE);
    expect(cards()).toHaveLength(0);
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("shows when a routine is due, and rings with its own words", () => {
    show(schedule(NOW, [], [occurrence(NOW, { inMs: 12 * MINUTE })]));
    expect(remaining()).toBe("12min");
    expect(screen.getByText("alle 08:10")).toBeTruthy();
    tick(12 * MINUTE);
    expect(screen.getByText("È ora!")).toBeTruthy();
  });

  it("shows paused timers as paused", () => {
    show(schedule(NOW, [timer(NOW, { status: "paused", remainingMs: 6 * MINUTE })]));
    expect(cards()[0].classList.contains("phase-paused")).toBe(true);
    expect(screen.getByText("In pausa · 6 min")).toBeTruthy();
  });

  it("shows at most 3 items, ringing first, with a badge for the rest", () => {
    show(schedule(NOW, [
      timer(NOW, { title: "Lego", status: "paused", remainingMs: 4 * MINUTE }),
      timer(NOW, { title: "Bagnetto", remainingMs: 9 * MINUTE }),
      timer(NOW, { title: "Denti", remainingMs: 2 * MINUTE })
    ], [occurrence(NOW, { title: "Spazzatura", inMs: -10_000 })]));
    expect(cards().map((card) => card.querySelector(".schedule-title")?.textContent)).toEqual(["Spazzatura", "Denti", "Bagnetto"]);
    expect(document.querySelector(".schedule-stage")?.classList.contains("count-3")).toBe(true);
    expect(screen.getByText("+1 altro")).toBeTruthy();
  });

  it("draws each countdown style", () => {
    show(schedule(NOW, [
      timer(NOW, { style: "sweets", durationMs: 10 * MINUTE, remainingMs: 7.5 * MINUTE }),
      timer(NOW, { style: "journey" })
    ], [occurrence(NOW, { style: "clock", inMs: 12 * MINUTE })]));
    const byStyle = Object.fromEntries(cards().map((card) => [card.dataset.style, card]));
    expect(byStyle.sweets.querySelectorAll(".sweet")).toHaveLength(10);
    expect(byStyle.sweets.querySelectorAll(".sweet-fill")).toHaveLength(8); // 7 full and one half-eaten
    expect(byStyle.journey.querySelector(".lucide-snail")).toBeTruthy();
    expect(byStyle.clock.querySelectorAll(".clock-hand")).toHaveLength(2);
    expect(byStyle.clock.querySelector(".clock-zone")).toBeTruthy();
  });

  it("uses the chosen icon, a default per kind, and an exclamation mark for unknown keys", () => {
    show(schedule(NOW, [
      timer(NOW, { title: "A", icon: "pot" }),
      timer(NOW, { title: "B", icon: null }),
      timer(NOW, { title: "C", icon: "rubber-duck" })
    ]));
    const icon = (title: string) => cards().find((card) => card.textContent?.includes(title))?.querySelector(".schedule-icon svg");
    expect(icon("A")?.classList.contains("lucide-cooking-pot")).toBe(true);
    expect(icon("B")?.classList.contains("lucide-timer")).toBe(true);
    expect(icon("C")?.classList.contains("lucide-circle-alert")).toBe(true);
  });

  it("re-renders immediately when a new schedule arrives", () => {
    const view = show(schedule(NOW));
    view.rerender(<ScheduleStage schedule={schedule(NOW, [timer(NOW)])} serverNow={() => Date.now()} i18n={ROME} onActiveChange={onActiveChange} />);
    expect(cards()).toHaveLength(1);
  });
});
