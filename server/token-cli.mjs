// Manage API tokens for integrations:  npm run token -- create <name> [--scope schedule|admin] | list | revoke <name>
// Run it on the device, in the app directory (it reads .env like the server). Changes take effect immediately,
// also while the server is running.
import fs from "node:fs";
import { adminAuthWarnings } from "./lib/admin-auth.mjs";
import { TOKEN_SCOPES, createApiTokenStore } from "./lib/api-tokens.mjs";
import { createRuntimeConfig, loadDotEnv } from "./lib/env.mjs";

const USAGE = `Usage: npm run token -- create <name> [--scope schedule|admin]
           create a token (shown only once). schedule (default): timers and routines only;
           admin: everything the admin PIN can do
       npm run token -- list            list tokens (names, scopes and dates, never the tokens)
       npm run token -- revoke <name>   revoke a token`;

await loadDotEnv();
const runtime = createRuntimeConfig();
const [command, name, ...options] = process.argv.slice(2);
const scope = parseScope(options);

if (!["create", "list", "revoke"].includes(command) || (command !== "list" && !name) || scope === null
  || (command !== "create" && options.length > 0)) {
  console.error(USAGE);
  process.exit(2);
}

fs.mkdirSync(runtime.dataDir, { recursive: true });
const tokens = createApiTokenStore({ dbPath: runtime.settingsDbPath });
tokens.ensureSchema();

try {
  if (command === "create") {
    const { token } = tokens.create(name, scope);
    const rights = scope === "admin" ? "full admin access" : "timers and routines only";
    console.log(`Created token "${name}" (${scope}: ${rights}). Copy it now: it is shown only now and cannot be recovered.\n`);
    console.log(`  ${token}\n`);
    console.log("Send it as:  Authorization: Bearer <token>");
    for (const warning of adminAuthWarnings(runtime).filter((text) => text.includes("not set"))) console.error(`Warning: ${warning}`);
  } else if (command === "list") {
    const rows = tokens.list();
    if (rows.length === 0) console.log("No API tokens.");
    for (const row of rows) {
      console.log(`${row.name.padEnd(30)} ${row.scope.padEnd(9)} created ${row.createdAt}   last used ${row.lastUsedAt ?? "never"}`);
    }
  } else if (tokens.revoke(name)) {
    console.log(`Revoked token "${name}".`);
  } else {
    console.error(`No token named "${name}".`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  tokens.close();
}

/** "--scope admin" → "admin"; no options → "schedule"; anything else → null (usage error). */
function parseScope(args) {
  if (args.length === 0) return "schedule";
  if (args.length === 2 && args[0] === "--scope" && TOKEN_SCOPES.includes(args[1])) return args[1];
  return null;
}
