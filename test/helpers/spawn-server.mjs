import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const serverEntry = fileURLToPath(new URL("../../server/frame-server.mjs", import.meta.url));

/** Starts a real frame server on a free port. Returns its URL and a stop() function. */
export async function spawnServer({ cwd, env }) {
  const child = spawn(process.execPath, [serverEntry], {
    cwd,
    env: { ...process.env, FRAME_SERVER_PORT: "0", FRAME_TELEGRAM_BOT_TOKEN: "", FRAME_SCHEDULE_WEBHOOK_URL: "", ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const url = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Server did not start:\n${output}`)), 10_000);
    child.on("exit", (code) => { clearTimeout(timeout); reject(new Error(`Server exited early (${code}):\n${output}`)); });
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });
  return {
    url,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  };
}
