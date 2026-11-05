import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiTokenMigrations, createApiTokenStore } from "../../server/lib/api-tokens.mjs";
import { applyMigrations } from "../../server/lib/migrations.mjs";

const MINUTE = 60_000;

describe("API token store", () => {
  let tempDir;
  let dbPath;
  let tokens;
  let now;

  beforeEach(async () => {
    now = Date.parse("2025-09-12T07:00:00Z");
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "family-frame-tokens-"));
    dbPath = path.join(tempDir, "settings.sqlite");
    tokens = createApiTokenStore({ dbPath, clock: () => now });
    tokens.ensureSchema();
  });

  afterEach(async () => {
    tokens.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates long random tokens, shown once and stored only as a hash", () => {
    const { token, name } = tokens.create("home-assistant");
    expect(name).toBe("home-assistant");
    expect(token).toMatch(/^ff_[A-Za-z0-9_-]{43}$/);
    expect(tokens.create("n8n").token).not.toBe(token);

    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("SELECT * FROM api_tokens").all();
    db.close();
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain(token.slice(3));
  });

  it("limits new tokens to timers and routines unless created with the admin scope", () => {
    expect(tokens.create("home-assistant")).toMatchObject({ name: "home-assistant", scope: "schedule" });
    const admin = tokens.create("backup-script", "admin");
    expect(admin.scope).toBe("admin");
    expect(tokens.verify(admin.token)).toEqual({ name: "backup-script", scope: "admin" });
    expect(tokens.list().map(({ name, scope }) => [name, scope])).toEqual([["backup-script", "admin"], ["home-assistant", "schedule"]]);
    expect(() => tokens.create("x", "everything")).toThrow(/scope must be schedule or admin/);
  });

  it("keeps full rights for tokens created before scopes existed", async () => {
    const legacyPath = path.join(tempDir, "legacy.sqlite");
    const legacy = new DatabaseSync(legacyPath);
    applyMigrations(legacy, { scope: "auth", migrations: apiTokenMigrations, upTo: 1 });
    legacy.prepare("INSERT INTO api_tokens (name, token_hash, created_at) VALUES ('old', ?, 0)").run("a".repeat(64));
    legacy.close();

    const upgraded = createApiTokenStore({ dbPath: legacyPath });
    upgraded.ensureSchema();
    expect(upgraded.list()).toEqual([expect.objectContaining({ name: "old", scope: "admin" })]);
    upgraded.close();
  });

  it("verifies tokens and records when each was last used, at most once a minute", () => {
    const { token } = tokens.create("home-assistant");
    expect(tokens.list()).toEqual([{ name: "home-assistant", scope: "schedule", createdAt: "2025-09-12T07:00:00.000Z", lastUsedAt: null }]);

    now += 5_000;
    expect(tokens.verify(token)).toEqual({ name: "home-assistant", scope: "schedule" });
    expect(tokens.list()[0].lastUsedAt).toBe("2025-09-12T07:00:05.000Z");
    now += 10_000;
    tokens.verify(token);
    expect(tokens.list()[0].lastUsedAt).toBe("2025-09-12T07:00:05.000Z"); // throttled
    now += MINUTE;
    tokens.verify(token);
    expect(tokens.list()[0].lastUsedAt).toBe("2025-09-12T07:01:15.000Z");
  });

  it("rejects unknown, malformed and revoked tokens", () => {
    const { token } = tokens.create("home-assistant");
    expect(tokens.verify("ff_nope")).toBeNull();
    expect(tokens.verify("")).toBeNull();
    expect(tokens.verify(undefined)).toBeNull();
    expect(tokens.revoke("home-assistant")).toBe(true);
    expect(tokens.verify(token)).toBeNull();
    expect(tokens.revoke("home-assistant")).toBe(false);
    expect(tokens.list()).toEqual([]);
  });

  it("requires unique, simple names", () => {
    tokens.create("home-assistant");
    expect(() => tokens.create("home-assistant")).toThrow(/already exists/);
    for (const name of ["", "has space", "x".repeat(61), "-leading"]) {
      expect(() => tokens.create(name), name).toThrow(/name/);
    }
    tokens.revoke("home-assistant");
    expect(() => tokens.create("home-assistant")).not.toThrow(); // a revoked name can be reused
  });
});
