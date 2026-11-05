import { describe, expect, it } from "vitest";
import { createClockSync } from "../../src/frame/lib/clockSync";

// sentAt / receivedAt are performance.now() readings (monotonic); serverTime is the server's epoch ms.
describe("clock sync", () => {
  it("falls back to the local wall clock before the first response", () => {
    const sync = createClockSync();
    expect(sync.serverNow(5_000, 1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(sync.isSynced()).toBe(false);
  });

  it("assumes the server read its clock halfway through the round trip", () => {
    const sync = createClockSync();
    sync.addSample({ sentAt: 1_000, receivedAt: 1_100, serverTime: 50_000 });
    expect(sync.isSynced()).toBe(true);
    expect(sync.serverNow(1_050, 0)).toBe(50_000);
    expect(sync.serverNow(61_050, 0)).toBe(110_000); // one minute later
  });

  it("ignores jumps of the local wall clock", () => {
    const sync = createClockSync();
    sync.addSample({ sentAt: 0, receivedAt: 20, serverTime: 50_000 });
    expect(sync.serverNow(10_010, 1)).toBe(sync.serverNow(10_010, 9_999_999_999));
  });

  it("trusts the sample with the shortest round trip", () => {
    const sync = createClockSync();
    sync.addSample({ sentAt: 0, receivedAt: 800, serverTime: 10_700 }); // slow: midpoint 400 → offset 10_300
    sync.addSample({ sentAt: 1_000, receivedAt: 1_020, serverTime: 11_310 }); // fast: midpoint 1_010 → offset 10_300
    sync.addSample({ sentAt: 2_000, receivedAt: 2_600, serverTime: 12_000 }); // slow and skewed
    expect(sync.serverNow(3_000, 0)).toBe(13_300);
    expect(sync.roundTripMs()).toBe(20);
  });

  it("forgets old samples so long-running frames follow clock drift", () => {
    const sync = createClockSync({ maxSampleAgeMs: 60_000 });
    sync.addSample({ sentAt: 0, receivedAt: 10, serverTime: 1_000_005 }); // fast but old
    sync.addSample({ sentAt: 100_000, receivedAt: 100_400, serverTime: 1_100_700 }); // slower, recent
    expect(sync.serverNow(100_200, 0)).toBe(1_100_700);
  });

  it("keeps at most maxSamples", () => {
    const sync = createClockSync({ maxSamples: 2 });
    sync.addSample({ sentAt: 0, receivedAt: 2, serverTime: 1_001 }); // best, but will be evicted
    sync.addSample({ sentAt: 10, receivedAt: 110, serverTime: 2_060 });
    sync.addSample({ sentAt: 20, receivedAt: 120, serverTime: 2_070 });
    expect(sync.roundTripMs()).toBe(100);
  });

  it("rejects impossible samples", () => {
    const sync = createClockSync();
    sync.addSample({ sentAt: 100, receivedAt: 50, serverTime: 1 });
    sync.addSample({ sentAt: 0, receivedAt: 10, serverTime: Number.NaN });
    expect(sync.isSynced()).toBe(false);
  });

  it("parses serverTime from an ISO string", () => {
    const sync = createClockSync();
    sync.addSample({ sentAt: 0, receivedAt: 0, serverTime: "2025-09-12T07:00:00.000Z" });
    expect(sync.serverNow(1_000, 0)).toBe(Date.parse("2025-09-12T07:00:01.000Z"));
  });
});
