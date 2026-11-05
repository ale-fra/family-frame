/**
 * Estimates the server clock from API responses that carry `serverTime`, so countdowns on the frame match the
 * server even when the display runs on a machine with a different (or jumping) clock.
 *
 * Each sample is one request: `sentAt` / `receivedAt` are `performance.now()` readings (monotonic, immune to
 * local clock changes) and `serverTime` is the server clock while it built the response. Assuming the server
 * read its clock halfway through the round trip, the error is at most half the round trip, so the sample with
 * the shortest round trip among recent ones wins. Samples expire so a long-running frame follows clock drift.
 */
export interface ClockSample {
  sentAt: number;
  receivedAt: number;
  serverTime: number | string;
}

export interface ClockSyncOptions {
  maxSamples?: number;
  maxSampleAgeMs?: number;
}

interface Anchor {
  monotonicMs: number;
  serverMs: number;
  roundTripMs: number;
}

export function createClockSync({ maxSamples = 8, maxSampleAgeMs = 30 * 60_000 }: ClockSyncOptions = {}) {
  let anchors: Anchor[] = [];

  function best(): Anchor | null {
    if (anchors.length === 0) return null;
    const newest = anchors[anchors.length - 1].monotonicMs;
    const recent = anchors.filter((anchor) => newest - anchor.monotonicMs <= maxSampleAgeMs);
    return recent.reduce((winner, anchor) => (anchor.roundTripMs < winner.roundTripMs ? anchor : winner));
  }

  return {
    addSample({ sentAt, receivedAt, serverTime }: ClockSample) {
      const serverMs = typeof serverTime === "string" ? Date.parse(serverTime) : serverTime;
      const roundTripMs = receivedAt - sentAt;
      if (!Number.isFinite(serverMs) || !Number.isFinite(roundTripMs) || roundTripMs < 0) return;
      anchors = [...anchors, { monotonicMs: sentAt + roundTripMs / 2, serverMs, roundTripMs }].slice(-maxSamples);
    },

    /** Server epoch ms now. `monotonicNow` = performance.now(); `wallNow` = Date.now(), used until synced. */
    serverNow(monotonicNow: number, wallNow: number): number {
      const anchor = best();
      return anchor ? anchor.serverMs + (monotonicNow - anchor.monotonicMs) : wallNow;
    },

    isSynced() {
      return anchors.length > 0;
    },

    /** Round trip of the sample in use (precision is ± half of it); null before the first sample. */
    roundTripMs() {
      return best()?.roundTripMs ?? null;
    }
  };
}
