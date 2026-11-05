import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameApp } from "../../src/frame/FrameApp";
import { FakeEventSource } from "../helpers/fake-event-source";
import { MINUTE, schedule, timer } from "../helpers/schedule-fixtures";

// The frame with every server call faked: photos, settings (English, Rome), schedule; weather and calendars fail.
describe("FrameApp with timers", () => {
  // Like the real server, serverTime is the moment each request is answered.
  let scheduleBody: () => unknown;

  beforeEach(() => {
    FakeEventSource.reset();
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.startsWith("/api/schedule")) return json(scheduleBody());
      if (url.startsWith("/api/settings")) return json({ i18n: { locale: "en-GB", language: "en", timeZone: "Europe/Rome" } });
      if (url.startsWith("/api/photos")) return json({ photos: [{ id: "p1", src: "/media/photos/a.jpg", createdAt: "2025-01-01" }] });
      if (url.startsWith("/frame.config.json")) return json({ calendar: { icsUrl: "", sourcesUrl: "" } });
      throw new TypeError(`offline: ${url}`);
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const photoStage = () => document.querySelector(".photo-stage")!;

  it("shows the photos while nothing is scheduled, in the server's language", async () => {
    scheduleBody = () => schedule(Date.now());
    render(<FrameApp />);
    await waitFor(() => expect(screen.getByText("Upcoming events")).toBeTruthy());
    expect(photoStage().classList.contains("is-covered")).toBe(false);
    expect(document.querySelector(".schedule-stage")).toBeNull();
  });

  it("shows the server time even if the display clock is wrong", async () => {
    const serverTime = Date.parse("2025-01-10T08:17:20Z");
    scheduleBody = () => schedule(serverTime);
    render(<FrameApp />);
    await waitFor(() => expect(document.querySelector(".time")?.textContent).toBe("09:17"));
  });

  it("covers the photos with a running timer, and gives them back when it is over", async () => {
    // shouldAdvanceTime: Testing Library's waitFor needs time to flow; the big jumps below are still manual.
    // "performance" too: the frame's server clock is monotonic (performance.now), see clockSync.ts.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"], shouldAdvanceTime: true });
    const pasta = timer(Date.now(), { title: "Pasta is ready", remainingMs: 3_000 });
    scheduleBody = () => schedule(Date.now(), [pasta]);
    render(<FrameApp />);
    await waitFor(() => expect(screen.getByText("Pasta is ready")).toBeTruthy());
    // The stage reports itself active right after its first render; the photo is hidden in the next one (the
    // opaque stage already covers it on screen in between).
    await waitFor(() => expect(photoStage().classList.contains("is-covered")).toBe(true));
    expect(photoStage().getAttribute("aria-hidden")).toBe("true");

    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByText("Time's up!")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(MINUTE); });
    expect(document.querySelector(".schedule-stage")).toBeNull();
    await waitFor(() => expect(photoStage().classList.contains("is-covered")).toBe(false));
  });

  it("reacts to a timer created while the frame is open", async () => {
    scheduleBody = () => schedule(Date.now());
    render(<FrameApp />);
    await waitFor(() => expect(FakeEventSource.open()).toHaveLength(1)); // photos, settings and schedule share it
    scheduleBody = () => schedule(Date.now(), [timer(Date.now(), { title: "Eggs" })]);
    act(() => FakeEventSource.open()[0].emit({ type: "timers", detail: { action: "created" } }));
    await waitFor(() => expect(screen.getByText("Eggs")).toBeTruthy());
  });
});
