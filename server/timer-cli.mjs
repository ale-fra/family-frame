// Start a timer on the frame from the command line and follow it until it rings:
//   npm run timer -- <duration> [title] [--style disc|sweets|journey|clock] [--icon <key>]
//   npm run add-3-min-timer
// Run it next to the server (same folder and .env), with the server running. When FRAME_ADMIN_PIN is set it creates a
// temporary API token (scope: schedule) in the frame's database and revokes it when it ends, so no credentials are
// needed or left behind; without a PIN the API is open and no token is needed. Ctrl+C cancels the timer on the frame.
// FRAME_API_URL overrides the server address (default http://127.0.0.1:<FRAME_SERVER_PORT>).
import crypto from "node:crypto";
import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createRuntimeConfig, loadDotEnv } from "./lib/env.mjs";
import { formatCountdown, parseTimerArgs } from "./lib/timer-cli-utils.mjs";

const USAGE = `Usage: npm run timer -- <duration> [title] [--style disc|sweets|journey|clock] [--icon <key>]
  duration: 3m, 90s, 1h30m, 2m30s (a plain number means minutes)
  example:  npm run timer -- 10m "Pasta is ready" --icon pot`;
const POLL_MS = 500;
const interactive = Boolean(process.stdout.isTTY);

await loadDotEnv();
const runtime = createRuntimeConfig();
const options = parseTimerArgs(process.argv.slice(2));
if (!options) {
  console.error(USAGE);
  process.exit(2);
}
const baseUrl = (process.env.FRAME_API_URL || `http://127.0.0.1:${runtime.port}`).replace(/\/$/, "");

// With a PIN the API needs credentials: a temporary token in the server's database. Without a PIN it is open.
let tokens = null;
let tokenName = null;
let token = null;
if (runtime.adminPin) {
  if (!fs.existsSync(runtime.settingsDbPath)) {
    console.error([
      `No frame database in ${runtime.dataDir}.`,
      "Start the server once in this folder (npm run server), or set FRAME_DATA_DIR to the server's data folder."
    ].join("\n"));
    process.exit(1);
  }
  // Loaded only when needed: without a PIN this command never touches the database (nor loads node:sqlite).
  const { createApiTokenStore } = await import("./lib/api-tokens.mjs");
  tokens = createApiTokenStore({ dbPath: runtime.settingsDbPath });
  tokens.ensureSchema();
  ({ name: tokenName, token } = tokens.create(`cli-timer-${crypto.randomBytes(3).toString("hex")}`, "schedule"));
}

const stop = new AbortController();
let stopSignal = null;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopSignal = signal;
    stop.abort();
  });
}

let timerId = null;
try {
  const created = await call("POST", "/api/admin/timers", {
    title: options.title,
    durationMs: options.durationMs,
    ...(options.style ? { style: options.style } : {}),
    ...(options.icon ? { icon: options.icon } : {})
  });
  timerId = created.timer.id;
  console.log(`⏱  "${created.timer.title}" started (${formatCountdown(created.timer.durationMs)}): watch the frame. Ctrl+C cancels it.`);

  let shown = "";
  for (;;) {
    const { timer } = await call("GET", `/api/admin/timers/${timerId}`);
    if (timer.status === "finished" || timer.status === "dismissed") {
      line(`🔔 "${timer.title}": time's up!`, true);
      break;
    }
    if (timer.status === "cancelled") {
      line(`✖  "${timer.title}" was cancelled on the frame.`, true);
      break;
    }
    const text = `⏱  ${timer.title}  ${formatCountdown(timer.remainingMs)} left${timer.status === "paused" ? " (paused)" : ""}`;
    if (text !== shown) {
      line(text, false);
      shown = text;
    }
    await delay(POLL_MS, undefined, { signal: stop.signal });
  }
} catch (error) {
  if (stop.signal.aborted) {
    if (timerId) {
      try {
        await call("POST", `/api/admin/timers/${timerId}/cancel`, undefined, { ignoreAbort: true });
        line("✖  Cancelled: the timer was removed from the frame.", true);
      } catch (cancelError) {
        line(`✖  Could not cancel the timer on the frame: ${cancelError.message}`, true);
      }
    } else {
      line("✖  Stopped before a timer was confirmed.", true);
    }
    process.exitCode = stopSignal === "SIGTERM" ? 143 : 130;
  } else {
    if (interactive) process.stdout.write("\n");
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  if (tokens) {
    tokens.revoke(tokenName);
    tokens.close();
  }
}

/** JSON API call with the temporary token. Server errors become Error(message from the server). */
async function call(method, url, body, { ignoreAbort = false } = {}) {
  let response;
  try {
    response = await fetch(baseUrl + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: ignoreAbort ? AbortSignal.timeout(5_000) : AbortSignal.any([stop.signal, AbortSignal.timeout(5_000)])
    });
  } catch (error) {
    if (stop.signal.aborted && !ignoreAbort) throw error;
    throw new Error(`Cannot reach the frame server at ${baseUrl}. Start it first, in another terminal: npm run server`);
  }
  if (response.status === 401) {
    throw new Error("The server requires the admin PIN: run this command with the same .env (FRAME_ADMIN_PIN) as the server.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `The server answered HTTP ${response.status}`);
  return payload;
}

/** One updating line on a terminal; plain lines otherwise (logs, tests). */
function line(text, final) {
  if (interactive) process.stdout.write(`\r\x1b[2K${text}${final ? "\n" : ""}`);
  else console.log(text);
}
