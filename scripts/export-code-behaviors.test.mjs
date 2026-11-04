import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exportCodeBehaviors } from "./export-code-behaviors.mjs";

let fixture;
beforeEach(async () => {
  fixture = await fs.mkdtemp(path.join(os.tmpdir(), "frame-export-"));
  const files = {
    "src/app.ts": "export const uncommitted = true;",
    "server/app.mjs": "export const demo = true;",
    "test/app.test.ts": "// Synthetic test fixture",
    "package.json": JSON.stringify({ scripts: { dev: "vite", server: "node server/app.mjs", build: "vite build", test: "vitest run", preview: "vite preview", kiosk: "must-not-export" } }),
    "package-lock.json": "{}", "index.html": "<html></html>",
    "tsconfig.json": "{}", "vite.config.ts": "", "vitest.config.ts": "", "components.json": "{}",
    "LICENSE": "MIT fixture", ".gitignore": "node_modules/\ndist/\ndata/\n",
    ".env.example": "# Synthetic example", "README.md": "Demo",
    "examples/frame.config.json": '{"frameName":"Demo"}',
    "examples/demo.ics": "BEGIN:VCALENDAR\nEND:VCALENDAR\n",
    "examples/demo-landscape.svg": "<svg/>",
    ".env": "SYNTHETIC_PRIVATE_MARKER", "data/private.json": "SYNTHETIC_PRIVATE_MARKER",
    ".git/config": "SYNTHETIC_PRIVATE_MARKER", "AGENTS.md": "SYNTHETIC_PRIVATE_MARKER",
    "src/AGENTS.md": "SYNTHETIC_PRIVATE_MARKER",
    "src/node_modules/unwanted.ts": "SYNTHETIC_PRIVATE_MARKER",
    "public/frame.config.json": "SYNTHETIC_PRIVATE_MARKER",
    "public/photos/private.jpg": "SYNTHETIC_PRIVATE_MARKER",
    "public/calendar/family.ics": "SYNTHETIC_PRIVATE_MARKER",
    "docs/workflow.md": "SYNTHETIC_PRIVATE_MARKER"
  };
  for (const [name, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(fixture, name)), { recursive: true });
    await fs.writeFile(path.join(fixture, name), text);
  }
});
afterEach(async () => { await fs.rm(fixture, { recursive: true, force: true }); });

it("exports working-tree source and synthetic assets, excluding private state, agents and device commands", async () => {
  const { directory, archive } = await exportCodeBehaviors({ rootDir: fixture });
  const listing = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
  expect(listing).not.toMatch(/\.git\/|AGENTS|node_modules|private|workflow|data\//);
  expect(await fs.readFile(path.join(directory, "src/app.ts"), "utf8")).toContain("uncommitted");
  expect(JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8")).scripts).not.toHaveProperty("kiosk");
  expect(await fs.readFile(path.join(directory, "public/frame.config.json"), "utf8")).toBe('{"frameName":"Demo"}');
  expect(listing).toContain("public/photos/demo-landscape.svg");
});

it("refuses symlinks in source trees instead of following them into private files", async () => {
  await fs.symlink(path.join(fixture, ".env"), path.join(fixture, "src/leak.ts"));
  await expect(exportCodeBehaviors({ rootDir: fixture })).rejects.toThrow("Refusing symbolic link");
});
