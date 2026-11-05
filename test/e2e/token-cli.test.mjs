import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PIN = "482913";

describe("token command line", () => {
  let dataDir;
  const cli = fileURLToPath(new URL("../../server/token-cli.mjs", import.meta.url));
  const run = (args, env = {}) => spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 15_000,
    cwd: dataDir,
    env: { ...process.env, FRAME_DATA_DIR: dataDir, FRAME_ADMIN_PIN: PIN, FRAME_PHOTO_SERVER_PORT: "", ...env }
  });

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-cli-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("creates, lists and revokes tokens", () => {
    const created = run(["create", "home-assistant"]);
    expect(created.status).toBe(0);
    expect(created.stdout).toMatch(/ff_[A-Za-z0-9_-]{43}/);
    expect(created.stdout).toMatch(/only now/i);
    expect(created.stdout).toMatch(/timers and routines only/);

    const admin = run(["create", "backup-script", "--scope", "admin"]);
    expect(admin.status).toBe(0);
    expect(admin.stdout).toMatch(/full admin access/);

    const listed = run(["list"]);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toMatch(/home-assistant\s+schedule/);
    expect(listed.stdout).toMatch(/backup-script\s+admin/);
    expect(listed.stdout).not.toMatch(/ff_/);
    expect(run(["revoke", "backup-script"]).status).toBe(0);

    expect(run(["create", "home-assistant"]).status).toBe(1);
    expect(run(["revoke", "home-assistant"]).status).toBe(0);
    expect(run(["revoke", "home-assistant"]).status).toBe(1);
    expect(run(["list"]).stdout).toMatch(/No API tokens/);
  });

  it("warns that tokens have no effect while no PIN is set", () => {
    const created = run(["create", "n8n"], { FRAME_ADMIN_PIN: "" });
    expect(created.status).toBe(0);
    expect(created.stderr).toMatch(/FRAME_ADMIN_PIN is not set/);
  });

  it("prints usage for unknown commands and options", () => {
    for (const args of [["frobnicate"], ["create"], ["create", "x", "--scope", "everything"], ["create", "x", "--admin"]]) {
      const result = run(args);
      expect(result.status, args.join(" ")).toBe(2);
      expect(result.stderr).toMatch(/Usage: npm run token -- create <name> \[--scope schedule\|admin\]/);
    }
  });
});
