import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceExtensions = new Set([".ts", ".tsx", ".mjs", ".css"]);
const excludedNames = new Set(["node_modules", ".git", "AGENTS.md", "CLAUDE.md", "SKILL.md"]);

async function copySourceTree(source, destination) {
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || excludedNames.has(entry.name)) continue;
    const input = path.join(source, entry.name);
    const output = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${input}`);
    if (entry.isDirectory()) {
      await copySourceTree(input, output);
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      await fs.mkdir(destination, { recursive: true });
      await fs.copyFile(input, output);
    }
  }
}

// Build from the working tree, including uncommitted source changes. Never copy
// the repository wholesale: runtime data and local public assets are private.
export async function exportCodeBehaviors({ rootDir = projectRoot, outputDir = path.join(rootDir, "exports") } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const staging = await fs.mkdtemp(path.join(outputDir, "code-behaviors-"));
  const destination = path.join(staging, "family-frame");
  await fs.mkdir(destination);
  for (const directory of ["src", "server", "test"]) {
    await copySourceTree(path.join(rootDir, directory), path.join(destination, directory));
  }
  for (const file of ["index.html", "tsconfig.json", "vite.config.ts", "vitest.config.ts", "components.json", "LICENSE", ".gitignore", ".env.example", "README.md"]) {
    await fs.copyFile(path.join(rootDir, file), path.join(destination, file));
  }

  const pkg = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
  pkg.scripts = Object.fromEntries(["dev", "server", "build", "test", "preview"].map((key) => [key, pkg.scripts[key]]));
  await fs.writeFile(path.join(destination, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  await fs.copyFile(path.join(rootDir, "package-lock.json"), path.join(destination, "package-lock.json"));

  await fs.mkdir(path.join(destination, "public/photos"), { recursive: true });
  await fs.mkdir(path.join(destination, "public/calendar"), { recursive: true });
  await fs.mkdir(path.join(destination, "examples"), { recursive: true });
  for (const name of ["frame.config.json", "demo.ics", "demo-landscape.svg"]) {
    await fs.copyFile(path.join(rootDir, "examples", name), path.join(destination, "examples", name));
  }
  // Use only curated examples, never public/frame.config.json or local media.
  for (const target of ["frame.config.json", "public/frame.config.json"]) {
    await fs.copyFile(path.join(rootDir, "examples/frame.config.json"), path.join(destination, target));
  }
  await fs.copyFile(path.join(rootDir, "examples/demo.ics"), path.join(destination, "public/calendar/family.ics"));
  await fs.copyFile(path.join(rootDir, "examples/demo-landscape.svg"), path.join(destination, "public/photos/demo-landscape.svg"));
  await fs.writeFile(path.join(destination, "public/photos/manifest.json"), JSON.stringify({
    photos: [{ src: "/photos/demo-landscape.svg", caption: "Paesaggio dimostrativo — immagine sintetica" }]
  }, null, 2) + "\n");

  const archive = path.join(staging, "family-frame.tar.gz");
  await execFileAsync("tar", ["-czf", archive, "-C", staging, "family-frame"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" }
  });
  return { directory: destination, archive };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const result = await exportCodeBehaviors();
  console.log(`Source folder: ${result.directory}\nUpload archive: ${result.archive}`);
  console.log("Review the archive before upload. Public repository status and platform eligibility are separate checks.");
}
