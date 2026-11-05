import { describe, expect, it } from "vitest";
import { adminAuthWarnings, createFailureLimiter, pinMatches } from "../../server/lib/admin-auth.mjs";

const PIN = "482913";
const MINUTE = 60_000;

describe("failed-attempt limiter", () => {
  it("blocks a client after 10 failures within 15 minutes, until the window ends", () => {
    let now = 0;
    const limiter = createFailureLimiter({ clock: () => now });
    for (let i = 0; i < 10; i += 1) {
      expect(limiter.retryAfterSeconds("10.0.0.5")).toBe(0);
      limiter.recordFailure("10.0.0.5");
    }
    expect(limiter.retryAfterSeconds("10.0.0.5")).toBe(15 * 60);
    expect(limiter.retryAfterSeconds("10.0.0.6")).toBe(0); // other devices unaffected
    now = 14 * MINUTE;
    expect(limiter.retryAfterSeconds("10.0.0.5")).toBe(60);
    now = 15 * MINUTE;
    expect(limiter.retryAfterSeconds("10.0.0.5")).toBe(0);
  });

  it("forgets old clients so memory stays bounded", () => {
    let now = 0;
    const limiter = createFailureLimiter({ clock: () => now, maxClients: 3 });
    for (const client of ["a", "b", "c", "d"]) limiter.recordFailure(client);
    expect(limiter.size()).toBeLessThanOrEqual(3);
    now = 16 * MINUTE;
    limiter.recordFailure("e");
    expect(limiter.size()).toBe(1);
  });
});

describe("PIN comparison", () => {
  it("matches only the exact PIN", () => {
    expect(pinMatches("482913", "482913")).toBe(true);
    expect(pinMatches("482914", "482913")).toBe(false);
    expect(pinMatches("48291", "482913")).toBe(false);
    expect(pinMatches("4829130", "482913")).toBe(false);
    expect(pinMatches(undefined, "482913")).toBe(false);
  });
});

describe("startup warnings", () => {
  it("warns when the admin endpoints are open or the PIN is short", () => {
    expect(adminAuthWarnings({ adminPin: "" })).toEqual([expect.stringMatching(/FRAME_ADMIN_PIN is not set/)]);
    expect(adminAuthWarnings({ adminPin: "1234" })).toEqual([expect.stringMatching(/shorter than 6/)]);
    expect(adminAuthWarnings({ adminPin: PIN })).toEqual([]);
  });
});
