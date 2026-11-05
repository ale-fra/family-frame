import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { testProjects } from "../../vitest.config";

// Each test type is a folder under test/ and a Vitest project (see vitest.config.ts). A test file anywhere else
// would match no project and silently never run, so this guards the layout.
const testRoot = fileURLToPath(new URL("..", import.meta.url));

function testFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return /\.test\.(ts|tsx|mjs)$/.test(entry.name) ? [path.relative(testRoot, full)] : [];
  });
}

describe("test layout", () => {
  it("puts every test file in a test-type folder, so that it runs", () => {
    const orphans = testFiles(testRoot).filter((file) => !Object.keys(testProjects).includes(file.split(path.sep)[0]));
    expect(orphans, `move these into ${Object.keys(testProjects).map((name) => `test/${name}/`).join(", ")}`).toEqual([]);
  });

  it("has a folder and an npm script for every test type", () => {
    const scripts = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts;
    for (const name of Object.keys(testProjects)) {
      expect(fs.existsSync(path.join(testRoot, name)), `test/${name}/`).toBe(true);
      expect(scripts[`test:${name}`]).toBe(`vitest run --project ${name}`);
    }
  });
});
