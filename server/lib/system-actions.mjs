import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

export function createSystemActions(runtime) {
  let refreshRunning = false;

  async function applyNightDisplaySettings(settings) {
    await new Promise((resolve, reject) => {
      let stderr = "";
      const child = spawn("bash", [runtime.nightDisplayScript], {
        cwd: runtime.rootDir,
        env: {
          ...process.env,
          FRAME_NIGHT_DISPLAY_ENABLED: settings.enabled ? "1" : "0",
          FRAME_NIGHT_OFF_TIME: settings.offTime,
          FRAME_MORNING_ON_TIME: settings.onTime,
          FRAME_DISPLAY_OUTPUT: settings.output,
          FRAME_X11_DISPLAY: process.env.DISPLAY || ":0"
        },
        stdio: ["ignore", "ignore", "pipe"]
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `install-night-display.sh exited with ${code}`));
      });
    });
  }

  async function setDisplayPower(action, output) {
    if (action === "on") {
      await runCommand("systemctl", ["--user", "restart", "family-frame-kiosk.service"]);
      return;
    }

    await runCommand("systemctl", ["--user", "stop", "family-frame-kiosk.service"]);
    await runCommand("xrandr", ["--output", output, "--off"], {
      DISPLAY: process.env.DISPLAY || ":0",
      XAUTHORITY: process.env.XAUTHORITY || path.join(process.env.HOME || "", ".Xauthority")
    });
  }

  async function triggerRefresh(source) {
    if (refreshRunning) return false;
    refreshRunning = true;

    const child = spawn("bash", [runtime.refreshScript], {
      cwd: runtime.rootDir,
      detached: true,
      env: {
        ...process.env,
        FRAME_REFRESH_SOURCE: source
      },
      stdio: "ignore"
    });
    child.unref();

    setTimeout(() => {
      refreshRunning = false;
    }, 60_000);

    return true;
  }

  async function runCommand(command, args, extraEnv = {}) {
    await new Promise((resolve, reject) => {
      let stderr = "";
      const child = spawn(command, args, {
        cwd: runtime.rootDir,
        env: {
          ...process.env,
          ...extraEnv
        },
        stdio: ["ignore", "ignore", "pipe"]
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `${command} exited with ${code}`));
      });
    });
  }

  return {
    applyNightDisplaySettings,
    setDisplayPower,
    triggerRefresh
  };
}
