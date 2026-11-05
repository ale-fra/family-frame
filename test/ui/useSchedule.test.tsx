import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeFrameEvents } from "../../src/frame/api";
import { useSchedule } from "../../src/frame/hooks/useSchedule";
import { FakeEventSource } from "../helpers/fake-event-source";

const SERVER_TIME = "2030-01-01T08:00:00.000Z"; // deliberately far from the test machine's clock

function scheduleBody(title = "Pasta") {
  return {
    serverTime: SERVER_TIME,
    timeZone: "Europe/Rome",
    timers: [{ id: "t1", title }],
    routines: []
  };
}

describe("useSchedule", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeEventSource.reset();
    vi.stubGlobal("EventSource", FakeEventSource);
    fetchMock = vi.fn(async () => new Response(JSON.stringify(scheduleBody()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const scheduleCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/schedule").length;

  it("loads /api/schedule when the frame starts", async () => {
    const { result } = renderHook(() => useSchedule());
    await waitFor(() => expect(result.current.schedule?.timers).toEqual([{ id: "t1", title: "Pasta" }]));
    expect(fetchMock).toHaveBeenCalledWith("/api/schedule", { cache: "no-store" });
  });

  it("reloads when the server announces a change or the event stream reconnects", async () => {
    const { result } = renderHook(() => useSchedule());
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    const [source] = FakeEventSource.open();
    const before = scheduleCalls();

    fetchMock.mockImplementation(async () => new Response(JSON.stringify(scheduleBody("Eggs")), { status: 200 }));
    act(() => source.emit({ type: "timers", detail: { action: "created" } }));
    await waitFor(() => expect(result.current.schedule?.timers[0].title).toBe("Eggs"));

    for (const type of ["routines", "schedule", "connected"]) {
      const calls = scheduleCalls();
      act(() => source.emit({ type }));
      await waitFor(() => expect(scheduleCalls()).toBe(calls + 1));
    }
    const calls = scheduleCalls();
    act(() => source.emit({ type: "photos" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scheduleCalls()).toBe(calls); // unrelated events do not reload
    expect(scheduleCalls()).toBeGreaterThan(before);
  });

  it("merges bursts of changes into one reload at a time", async () => {
    let release: () => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve(new Response(JSON.stringify(scheduleBody()), { status: 200 }));
    }));
    renderHook(() => useSchedule());
    const [source] = FakeEventSource.open();
    act(() => { for (let i = 0; i < 5; i += 1) source.emit({ type: "timers" }); });
    expect(scheduleCalls()).toBe(1);
    await act(async () => release());
    await waitFor(() => expect(scheduleCalls()).toBe(2)); // one follow-up for all five
    await act(async () => release());
    expect(scheduleCalls()).toBe(2);
  });

  it("polls every minute as a safety net", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    renderHook(() => useSchedule());
    await waitFor(() => expect(scheduleCalls()).toBe(1));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await waitFor(() => expect(scheduleCalls()).toBe(2));
  });

  it("follows the server clock, not the browser's", async () => {
    const { result } = renderHook(() => useSchedule());
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    expect(Math.abs(result.current.serverNow() - Date.parse(SERVER_TIME))).toBeLessThan(1_000);
  });

  it("keeps the last schedule when a reload fails", async () => {
    const { result } = renderHook(() => useSchedule());
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    fetchMock.mockImplementation(async () => { throw new TypeError("offline"); });
    act(() => FakeEventSource.open()[0].emit({ type: "timers" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.schedule?.timers[0].title).toBe("Pasta");
  });
});

describe("frame event stream", () => {
  beforeEach(() => {
    FakeEventSource.reset();
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is one connection shared by every listener, closed when the last one leaves", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeFrameEvents(first);
    const unsubscribeSecond = subscribeFrameEvents(second);
    expect(FakeEventSource.instances).toHaveLength(1);

    FakeEventSource.instances[0].emit({ type: "photos" });
    expect(first).toHaveBeenCalledWith({ type: "photos" });
    expect(second).toHaveBeenCalledWith({ type: "photos" });

    unsubscribeFirst();
    expect(FakeEventSource.instances[0].closed).toBe(false);
    unsubscribeSecond();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
