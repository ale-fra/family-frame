// Builds docs/mockups/schedule-ui.html (self-contained) from schedule-ui.template.html.
// The page runs the frame's real display rules (mockup-lib.ts → src/frame/lib/scheduleDisplay.ts) and real icon
// lookup (render-icons.ts → src/frame/lib/scheduleIcons.ts), bundled with esbuild. Usage: node docs/mockups/build.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MOCKUP_PATH = path.join(here, "schedule-ui.html");

export async function buildMockupHtml() {
  const lib = await build({
    entryPoints: [path.join(here, "mockup-lib.ts")],
    bundle: true, format: "iife", globalName: "FrameSchedule", target: "es2020", write: false, logLevel: "error"
  });

  const iconsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "frame-mockup-")), "icons.cjs");
  await build({
    entryPoints: [path.join(here, "render-icons.ts")],
    bundle: true, format: "cjs", platform: "node", outfile: iconsFile, logLevel: "error",
    define: { "process.env.NODE_ENV": '"production"' }
  });
  const icons = createRequire(import.meta.url)(iconsFile).renderIcons();
  fs.rmSync(path.dirname(iconsFile), { recursive: true, force: true });

  return fs.readFileSync(path.join(here, "schedule-ui.template.html"), "utf8")
    .replace("/*FRAME_SCHEDULE_LIB*/", () => lib.outputFiles[0].text)
    .replace("/*ICONS*/{}", () => JSON.stringify(icons));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(MOCKUP_PATH, await buildMockupHtml());
  console.log(`wrote ${path.relative(process.cwd(), MOCKUP_PATH)}`);
}
