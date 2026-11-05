import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";

it.each([
  ["frame-server", "FRAME_SERVER_PORT"],
  ["photo-server", "FRAME_PHOTO_SERVER_PORT"]
])("starts %s through a symlink and reads the local .env config override", async (entry, portVar) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "frame-startup-"));
  let child;
  try {
    const launcher = path.join(directory, "start-frame.mjs");
    await fs.symlink(fileURLToPath(new URL(`../../server/${entry}.mjs`, import.meta.url)), launcher);
    const configFile = path.join(directory, "synthetic-config.json");
    await fs.writeFile(configFile, JSON.stringify({ frameName: "Synthetic test frame" }));
    await fs.writeFile(path.join(directory, ".env"), `FRAME_CONFIG_FILE=${configFile}\n`);
    const env = {
      ...process.env,
      FRAME_DATA_DIR: path.join(directory, "data"),
      FRAME_ADMIN_PIN: "",
      FRAME_TELEGRAM_BOT_TOKEN: "",
      FRAME_CALENDAR_ICS_URL: "",
      FRAME_CALENDAR_ICS_URLS: "",
      FRAME_CALENDAR_SOURCES_FILE: ""
    };
    delete env.FRAME_CONFIG_FILE;
    delete env.FRAME_PHOTO_SERVER_PORT;
    delete env.FRAME_SERVER_PORT;
    env[portVar] = "0";
    child = spawn(process.execPath, [launcher], { cwd: directory, env, stdio: ["ignore", "pipe", "pipe"] });
    const url = await new Promise((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(new Error("Server did not start")), 15_000);
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("exit", (code) => { clearTimeout(timeout); reject(new Error(`Server exited before startup: ${code}`)); });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    expect((await fetch(url + "/api/health")).status).toBe(200);
    expect((await fetch(url + "/api/schedule")).status).toBe(200);
    expect(await (await fetch(url + "/api/admin/capabilities")).json()).toEqual({
      displayPower: false, nightDisplay: false, refresh: false
    });
    expect(await (await fetch(url + "/frame.config.json")).json()).toEqual({ frameName: "Synthetic test frame" });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
