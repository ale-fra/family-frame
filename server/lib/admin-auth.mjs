import crypto from "node:crypto";

const FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const MAX_TRACKED_CLIENTS = 1_000;
const MIN_RECOMMENDED_PIN_LENGTH = 6;

/**
 * Protects the admin API. Accepted credentials, when FRAME_ADMIN_PIN is set:
 *   X-Frame-Admin-Pin: <PIN>                     the admin web page (unchanged)
 *   Authorization: Bearer <token>                integrations; tokens from `npm run token -- create <name>`
 *   Authorization: Basic base64(<any>:<token>)   tools that only support Basic: the token is the password
 * No PIN configured means the admin API is open (a warning is logged at startup).
 *
 * Tokens have a scope: "schedule" tokens may only use routes protected with requireAdmin.for("schedule")
 * (timers and routines); "admin" tokens and the PIN may use everything. A valid token used beyond its scope
 * gets 403 and does not count as a wrong attempt.
 *
 * Browsers never send any of these by themselves: the PIN is a custom header and the 401 challenge is "Bearer",
 * never "Basic", so no browser password prompt or cached credential exists for other websites to reuse.
 * Wrong credentials count as failed attempts; 10 within 15 minutes block that client address until the window
 * ends, even with the right PIN, so short PINs cannot be guessed quickly.
 */
export function createAdminAuth({ runtime, apiTokens = null, limiter = createFailureLimiter() }) {
  const middleware = (requiredScope) => function requireAdmin(request, response, next) {
    if (!runtime.adminPin) {
      next();
      return;
    }

    const client = request.socket.remoteAddress || "unknown";
    const retryAfter = limiter.retryAfterSeconds(client);
    if (retryAfter > 0) {
      response.setHeader("Retry-After", String(retryAfter));
      response.status(429).json({
        error: `Too many wrong attempts from this device; try again in ${Math.ceil(retryAfter / 60)} minutes`,
        code: "too-many-attempts"
      });
      return;
    }

    const pin = request.header("x-frame-admin-pin");
    const token = tokenFromAuthorization(request.header("authorization"));
    if (pin === undefined && token === null) {
      unauthorized(response);
      return;
    }

    if (pin !== undefined) {
      if (pinMatches(pin, runtime.adminPin)) {
        next();
        return;
      }
    } else {
      const verified = apiTokens?.verify(token);
      if (verified && (verified.scope === "admin" || verified.scope === requiredScope)) {
        next();
        return;
      }
      if (verified) {
        response.status(403).json({ error: "This API token is limited to timers and routines", code: "insufficient-scope" });
        return;
      }
    }
    limiter.recordFailure(client);
    unauthorized(response);
  };

  // requireAdmin: admin scope. requireAdmin.for("schedule"): also open to schedule tokens.
  // Both share one limiter, so wrong attempts count across all admin routes.
  const requireAdmin = middleware("admin");
  requireAdmin.for = (scope) => middleware(scope);
  return requireAdmin;
}

/** Constant-time comparison (hashing first makes the lengths equal). */
export function pinMatches(candidate, pin) {
  if (typeof candidate !== "string" || typeof pin !== "string") return false;
  const digest = (value) => crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(candidate), digest(pin));
}

/** Fixed-window counter of failed attempts per client address, kept in memory. */
export function createFailureLimiter({
  clock = Date.now,
  windowMs = FAILURE_WINDOW_MS,
  maxFailures = MAX_FAILURES,
  maxClients = MAX_TRACKED_CLIENTS
} = {}) {
  const clients = new Map(); // address → { failures, windowStartMs }

  function current(client, now) {
    const entry = clients.get(client);
    if (entry && now - entry.windowStartMs < windowMs) return entry;
    clients.delete(client);
    return null;
  }

  function prune(now) {
    for (const [client, entry] of clients) {
      if (now - entry.windowStartMs >= windowMs) clients.delete(client);
    }
    while (clients.size >= maxClients) clients.delete(clients.keys().next().value);
  }

  return {
    retryAfterSeconds(client) {
      const now = clock();
      const entry = current(client, now);
      if (!entry || entry.failures < maxFailures) return 0;
      return Math.ceil((entry.windowStartMs + windowMs - now) / 1000);
    },

    recordFailure(client) {
      const now = clock();
      const entry = current(client, now);
      if (entry) {
        entry.failures += 1;
        return;
      }
      prune(now);
      clients.set(client, { failures: 1, windowStartMs: now });
    },

    size() {
      return clients.size;
    }
  };
}

export function adminAuthWarnings(runtime) {
  if (!runtime.adminPin) {
    return ["FRAME_ADMIN_PIN is not set: the admin API (photos, settings, timers, routines) is open to every " +
      "device on the network, and API tokens have no effect."];
  }
  if (runtime.adminPin.length < MIN_RECOMMENDED_PIN_LENGTH) {
    return [`FRAME_ADMIN_PIN is shorter than ${MIN_RECOMMENDED_PIN_LENGTH} characters: consider a longer one.`];
  }
  return [];
}

function tokenFromAuthorization(header) {
  if (typeof header !== "string") return null;
  const [scheme, value = ""] = header.trim().split(/\s+/, 2);
  if (/^bearer$/i.test(scheme)) return value;
  if (/^basic$/i.test(scheme)) {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator === -1 ? null : decoded.slice(separator + 1);
  }
  return null;
}

function unauthorized(response) {
  response.setHeader("WWW-Authenticate", 'Bearer realm="family-frame"');
  response.status(401).json({ error: "Admin PIN or API token required" });
}
