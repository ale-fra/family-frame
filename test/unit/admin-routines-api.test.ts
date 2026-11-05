import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, UnauthorizedError } from "../../src/admin/api";
import * as routinesApi from "../../src/admin/routines/api";

// The admin's routines client: right URLs, methods, PIN header and bodies; server errors surface as ApiRequestError.
describe("admin routines API client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const PIN = "482913";

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ routine: { id: "r1" }, routines: [], occurrences: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return { url, method: init.method ?? "GET", headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
  };

  it.each([
    ["listRoutines", () => routinesApi.listRoutines(PIN, true), "GET", "/api/admin/routines?includeCancelled=true", undefined],
    ["createRoutine", () => routinesApi.createRoutine(PIN, { title: "x" } as never), "POST", "/api/admin/routines", { title: "x" }],
    ["updateRoutine", () => routinesApi.updateRoutine(PIN, "r1", { time: "08:30" }), "PATCH", "/api/admin/routines/r1", { time: "08:30" }],
    ["pauseRoutine", () => routinesApi.pauseRoutine(PIN, "r1", "2026-09-14"), "POST", "/api/admin/routines/r1/pause", { resumeOn: "2026-09-14" }],
    ["pauseRoutine (no date)", () => routinesApi.pauseRoutine(PIN, "r1", ""), "POST", "/api/admin/routines/r1/pause", {}],
    ["resumeRoutine", () => routinesApi.resumeRoutine(PIN, "r1"), "POST", "/api/admin/routines/r1/resume", undefined],
    ["cancelRoutine", () => routinesApi.cancelRoutine(PIN, "r1"), "POST", "/api/admin/routines/r1/cancel", undefined],
    ["skipOccurrence", () => routinesApi.skipOccurrence(PIN, "r1", "2025-09-15"), "PUT", "/api/admin/routines/r1/exceptions/2025-09-15", { kind: "skipped" }],
    ["restoreOccurrence", () => routinesApi.restoreOccurrence(PIN, "r1", "2025-09-15"), "DELETE", "/api/admin/routines/r1/exceptions/2025-09-15", undefined]
  ])("%s", async (_name, call, method, url, body) => {
    await call();
    expect(lastCall()).toMatchObject({ url, method, body });
    expect(lastCall().headers).toMatchObject({ "x-frame-admin-pin": PIN });
  });

  it("asks for occurrences in a window", async () => {
    await routinesApi.listOccurrences(PIN, "2025-09-15T00:00:00.000Z", "2025-09-29T00:00:00.000Z");
    expect(lastCall().url).toBe("/api/admin/routines/occurrences?from=2025-09-15T00%3A00%3A00.000Z&to=2025-09-29T00%3A00%3A00.000Z");
  });

  it("reports server validation messages and a lost PIN", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "time must be HH:MM (24h)", code: "invalid-input" }), { status: 400 }));
    await expect(routinesApi.createRoutine(PIN, {} as never)).rejects.toEqual(new ApiRequestError("time must be HH:MM (24h)", 400));
    fetchMock.mockImplementation(async () => new Response("{}", { status: 401 }));
    await expect(routinesApi.listRoutines(PIN, false)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
