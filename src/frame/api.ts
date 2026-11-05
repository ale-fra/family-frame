import type { FrameSettings, PhotoManifest } from "@/lib/types";
import type { ClockSample } from "./lib/clockSync";
import type { PublicSchedule } from "./lib/scheduleDisplay";

export type FrameServerEvent = {
  type: string;
  detail?: unknown;
  at?: string;
};

export async function fetchApprovedPhotos() {
  try {
    const response = await fetch("/api/photos?status=approved", { cache: "no-store" });
    if (!response.ok) throw new Error("Photo API unavailable");
    const manifest = await response.json() as PhotoManifest;
    return manifest.photos.filter((photo) => photo.src);
  } catch {
    return null;
  }
}

export async function fetchFrameSettings(): Promise<FrameSettings> {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) return {};
    return await response.json() as FrameSettings;
  } catch {
    return {};
  }
}

export function logFrameEvent(event: string, details: Record<string, string | number | boolean | null>) {
  const payload = {
    event,
    clientId: frameClientId(),
    bootId: frameBootId(),
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    details
  };

  fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {
    // The frame should keep running even when the local photo server is unavailable.
  });
}

// One EventSource for the whole frame, shared by every listener (photos, settings, schedule). Browsers allow only
// 6 connections per server over plain HTTP, and each open event stream holds one of them.
const frameEventListeners = new Set<(event: FrameServerEvent) => void>();
let frameEventSource: EventSource | null = null;

export function subscribeFrameEvents(onEvent: (event: FrameServerEvent) => void) {
  if (typeof EventSource === "undefined") return () => {};

  frameEventListeners.add(onEvent);
  if (!frameEventSource) {
    frameEventSource = new EventSource("/api/events");
    frameEventSource.onmessage = (message) => {
      let event: FrameServerEvent;
      try {
        event = JSON.parse(message.data) as FrameServerEvent;
      } catch {
        return; // Ignore malformed event payloads; polling remains the fallback.
      }
      for (const listener of [...frameEventListeners]) listener(event);
    };
  }

  return () => {
    frameEventListeners.delete(onEvent);
    if (frameEventListeners.size === 0 && frameEventSource) {
      frameEventSource.close();
      frameEventSource = null;
    }
  };
}

/**
 * GET /api/schedule, with a clock sample: the monotonic time before sending and when the response headers arrived.
 * Returns null when the server cannot be reached.
 */
export async function fetchSchedule(): Promise<{ schedule: PublicSchedule; sample: ClockSample } | null> {
  try {
    const sentAt = performance.now();
    const response = await fetch("/api/schedule", { cache: "no-store" });
    const receivedAt = performance.now();
    if (!response.ok) return null;
    const schedule = await response.json() as PublicSchedule;
    return { schedule, sample: { sentAt, receivedAt, serverTime: schedule.serverTime } };
  } catch {
    return null;
  }
}

function frameClientId() {
  return storedFrameId("family-frame-client-id");
}

function frameBootId() {
  const frameWindow = window as Window & { __familyFrameBootId?: string };
  if (!frameWindow.__familyFrameBootId) {
    frameWindow.__familyFrameBootId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  }
  return frameWindow.__familyFrameBootId;
}

function storedFrameId(key: string) {
  try {
    const current = window.sessionStorage.getItem(key);
    if (current) return current;
    const next = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return "session-storage-unavailable";
  }
}
