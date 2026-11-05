import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawnServer } from "../helpers/spawn-server.mjs";

// `npm run timer -- <duration> [title]` / `npm run add-3-min-timer` against a real server process.
const cli = fileURLToPath(new URL("../../server/timer-cli.mjs", import.meta.url));
const PIN = "482913";

describe("timer command line", () => {
  let dir;
  let server;
  let env;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-timer-cli-"));
    env = { FRAME_DATA_DIR: path.join(dir, "data"), FRAME_ADMIN_PIN: PIN, FRAME_TIMEZONE: "Europe/Rome" };
    server = await spawnServer({ cwd: dir, env });
    env.FRAME_API_URL = server.url;
  }, 20_000);

  afterAll(async () => {
    await server?.stop();
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    for (const timer of await admin("GET", "/api/admin/timers").then((body) => body.timers)) {
      await admin("POST", `/api/admin/timers/${timer.id}/cancel`);
    }
  });

  async function admin(method, url, body) {
    const response = await fetch(server.url + url, {
      method,
      headers: { "x-frame-admin-pin": PIN, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    return response.json();
  }

  /** Runs the CLI; resolves with its exit code and output. `onOutput` can react to what it prints. */
  function run(args, { onOutput } = {}) {
    const child = spawn(process.execPath, [cli, ...args], { cwd: dir, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; onOutput?.(stdout, child); });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    return new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal, stdout, stderr })));
  }

  const tokensLeft = () => {
    const db = new DatabaseSync(path.join(env.FRAME_DATA_DIR, "settings.sqlite"));
    const rows = db.prepare("SELECT name FROM api_tokens").all();
    db.close();
    return rows;
  };

  it("starts a timer the frame shows, counts it down on one line and exits when it rings", async () => {
    const result = await run(["2s", "Eggs"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Eggs/);
    expect(result.stdout).toMatch(/0:02 left/);
    expect(result.stdout).toMatch(/0:01 left/);
    expect(result.stdout).toMatch(/time's up/i);
    const timer = (await admin("GET", "/api/admin/timers?includeClosed=true")).timers.find((t) => t.title === "Eggs");
    expect(timer).toMatchObject({ durationMs: 2_000, status: "finished" });
    expect(tokensLeft()).toEqual([]); // the temporary token is gone
  }, 20_000);

  it("cancels the timer on the frame when stopped with Ctrl+C", async () => {
    const result = await run(["5m", "Long", "one"], {
      onOutput: (stdout, child) => { if (stdout.includes("left") && !child.killed) child.kill("SIGINT"); }
    });
    expect(result.code).toBe(130);
    expect(result.stdout).toMatch(/cancelled/i);
    expect((await admin("GET", "/api/admin/timers")).timers).toEqual([]);
    const timer = (await admin("GET", "/api/admin/timers?includeClosed=true")).timers.find((t) => t.title === "Long one");
    expect(timer).toMatchObject({ status: "cancelled" });
    expect(tokensLeft()).toEqual([]);
  }, 20_000);

  it("passes style and icon, and reports the server's refusal when 3 timers are already on", async () => {
    for (const title of ["A", "B", "C"]) await admin("POST", "/api/admin/timers", { title, durationMs: 60_000 });
    const result = await run(["3m", "Test timer", "--style", "sweets", "--icon", "pot"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/At most 3 timers/);
    expect(tokensLeft()).toEqual([]);
  }, 20_000);

  it("explains how to call it", () => {
    const result = spawnSync(process.execPath, [cli, "soon"], { cwd: dir, env: { ...process.env, ...env }, encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Usage: npm run timer -- <duration> \[title\]/);
  });

  it("explains what to do when the frame database is not in this folder", () => {
    const result = spawnSync(process.execPath, [cli, "1m"], {
      cwd: dir, env: { ...process.env, ...env, FRAME_DATA_DIR: path.join(dir, "elsewhere") }, encoding: "utf8"
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/No frame database in .*elsewhere/);
    expect(result.stderr).toMatch(/npm run server/);
    expect(result.stderr).toMatch(/FRAME_DATA_DIR/);
    expect(result.stderr).not.toMatch(/frame device/);
  });

  it("explains a PIN mismatch instead of failing obscurely", async () => {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [cli, "1m"], { cwd: dir, env: { ...process.env, ...env, FRAME_ADMIN_PIN: "" }, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("exit", (code) => resolve({ code, stderr }));
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/The server requires the admin PIN/);
    expect(result.stderr).toMatch(/FRAME_ADMIN_PIN/);
  });

  it("says so when the server is not running, and still cleans up", async () => {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [cli, "1m"], { cwd: dir, env: { ...process.env, ...env, FRAME_API_URL: "http://127.0.0.1:9" }, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("exit", (code) => resolve({ code, stderr }));
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/Cannot reach the frame server at http:\/\/127\.0\.0\.1:9/);
    expect(result.stderr).toMatch(/npm run server/);
    expect(tokensLeft()).toEqual([]);
  });
});

// No FRAME_ADMIN_PIN: the API is open, so the command needs no token and no access to the frame's database.
describe("timer command line without an admin PIN", () => {
  let dir;
  let server;
  let env;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-timer-cli-open-"));
    server = await spawnServer({ cwd: dir, env: { FRAME_DATA_DIR: path.join(dir, "server-data"), FRAME_ADMIN_PIN: "" } });
    env = { FRAME_ADMIN_PIN: "", FRAME_API_URL: server.url, FRAME_DATA_DIR: path.join(dir, "no-database-here") };
  }, 20_000);

  afterAll(async () => {
    await server?.stop();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("works without the frame's database", async () => {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [cli, "1s", "Open"], { cwd: dir, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("exit", (code) => resolve({ code, stdout, stderr }));
    });
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/time's up/);
    await expect(fs.access(env.FRAME_DATA_DIR)).rejects.toThrow(); // nothing created
  }, 20_000);
});
