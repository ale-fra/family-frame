import crypto from "node:crypto";
import { openDatabase } from "./database.mjs";
import { applyMigrations } from "./migrations.mjs";

const TOKEN_PREFIX = "ff_";
const TOKEN_PATTERN = /^ff_[A-Za-z0-9_-]{43}$/;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;
const LAST_USED_RESOLUTION_MS = 60_000;
// schedule: timers and routines only (the default: least privilege for third-party systems).
// admin: everything the admin PIN can do.
export const TOKEN_SCOPES = ["schedule", "admin"];

export const apiTokenMigrations = [
  {
    id: 1,
    name: "create-api-tokens",
    sql: `
      -- Bearer tokens for integrations (Home Assistant, scripts…). Only a SHA-256 hash is stored: the tokens
      -- are 256-bit random values, so a fast hash is enough (no brute force possible) and a database copy
      -- reveals nothing usable. Revoking deletes the row.
      CREATE TABLE api_tokens (
        name         TEXT PRIMARY KEY CHECK (length(name) BETWEEN 1 AND 60),
        token_hash   TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
        created_at   INTEGER NOT NULL,
        last_used_at INTEGER
      ) STRICT;
    `
  },
  {
    id: 2,
    name: "token-scope",
    sql: `
      -- Tokens created before scopes existed keep full rights; new tokens default to 'schedule' in code.
      ALTER TABLE api_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT 'admin' CHECK (scope IN ('schedule', 'admin'));
    `
  }
];

/** API tokens in the settings SQLite database. Managed from the command line (server/token-cli.mjs). */
/** @param options.db shared connection (see database.mjs), used as is and never closed here */
export function createApiTokenStore({ dbPath, db: providedDb = null, clock = Date.now }) {
  let db = providedDb;
  const ownsDb = !providedDb;

  function getDb() {
    if (!db) db = openDatabase(dbPath);
    return db;
  }

  return {
    ensureSchema() {
      applyMigrations(getDb(), { scope: "auth", migrations: apiTokenMigrations });
    },

    close() {
      if (ownsDb) db?.close();
      db = null;
    },

    /** Returns the token in clear text: the only time it is available. */
    create(name, scope = "schedule") {
      if (!TOKEN_SCOPES.includes(scope)) throw new Error(`Token scope must be ${TOKEN_SCOPES.join(" or ")}`);
      if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
        throw new Error("Token name must be 1-60 letters, digits, dots, dashes or underscores, starting with a letter or digit");
      }
      if (getDb().prepare("SELECT 1 FROM api_tokens WHERE name = ?").get(name)) {
        throw new Error(`A token named "${name}" already exists; revoke it first or pick another name`);
      }
      const token = TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
      getDb().prepare("INSERT INTO api_tokens (name, token_hash, scope, created_at) VALUES (?, ?, ?, ?)")
        .run(name, hashToken(token), scope, clock());
      return { name, scope, token };
    },

    list() {
      return getDb().prepare("SELECT name, scope, created_at, last_used_at FROM api_tokens ORDER BY name").all()
        .map((row) => ({
          name: row.name,
          scope: row.scope,
          createdAt: new Date(row.created_at).toISOString(),
          lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at).toISOString()
        }));
    },

    /** Returns true if a token was revoked. Takes effect immediately: tokens are checked on every request. */
    revoke(name) {
      return Number(getDb().prepare("DELETE FROM api_tokens WHERE name = ?").run(name).changes) > 0;
    },

    /** Returns { name, scope } for a valid token, otherwise null. */
    verify(token) {
      if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
      const row = getDb().prepare("SELECT name, scope, last_used_at FROM api_tokens WHERE token_hash = ?").get(hashToken(token));
      if (!row) return null;
      const now = clock();
      if (row.last_used_at === null || now - row.last_used_at >= LAST_USED_RESOLUTION_MS) {
        getDb().prepare("UPDATE api_tokens SET last_used_at = ? WHERE name = ?").run(now, row.name);
      }
      return { name: row.name, scope: row.scope };
    }
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
