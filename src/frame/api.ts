import type { FrameSettings, PhotoManifest } from "@/lib/types";

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

export function subscribeFrameEvents(onEvent: (event: FrameServerEvent) => void) {
  if (typeof EventSource === "undefined") return () => {};

  const source = new EventSource("/api/events");
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as FrameServerEvent);
    } catch {
      // Ignore malformed event payloads; polling remains the fallback.
    }
  };

  return () => source.close();
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
