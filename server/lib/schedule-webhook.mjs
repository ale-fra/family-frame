const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Delivers schedule events to an HTTP endpoint (e.g. a Home Assistant webhook that plays a sound).
 * POST, JSON body = the event. Best effort: one attempt, bounded by a timeout, failures are logged and never
 * thrown, so a slow or missing receiver cannot stall the frame. The optional secret is sent as
 * X-Frame-Webhook-Secret so the receiver can reject forged calls.
 * Resolves to true when the receiver answered 2xx.
 */
export function createWebhookSink({ url, secret = "", timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, log = console }) {
  return async function sendScheduleEvent(event) {
    const headers = { "Content-Type": "application/json", "User-Agent": "family-frame" };
    if (secret) headers["X-Frame-Webhook-Secret"] = secret;
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error"
      });
      await response.body?.cancel();
      if (response.ok) return true;
      log.warn(`Schedule webhook answered HTTP ${response.status} for ${event.type}`);
    } catch (error) {
      log.warn(`Schedule webhook failed for ${event.type}: ${error.name === "TimeoutError" ? "timeout" : error.message}`);
    }
    return false;
  };
}
