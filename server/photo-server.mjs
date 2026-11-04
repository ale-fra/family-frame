import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createPhotoServerApp } from "./lib/app.mjs";
import { createCalendarService } from "./lib/calendar-service.mjs";
import { createClientLog } from "./lib/client-log.mjs";
import { createRuntimeConfig, loadDotEnv } from "./lib/env.mjs";
import { createPhotoStore } from "./lib/photos.mjs";
import { createSettingsStore } from "./lib/settings-store.mjs";
import { createSystemActions } from "./lib/system-actions.mjs";
import { createTelegramService } from "./lib/telegram.mjs";

export async function startPhotoServer({ createActions = createSystemActions, defaultConfigFile = "" } = {}) {
  await loadDotEnv();

  const runtime = createRuntimeConfig();
  if (!runtime.configFile) runtime.configFile = defaultConfigFile;
  const settingsStore = createSettingsStore(runtime, () => calendarService.clearCalendarCache());
  const calendarService = createCalendarService(runtime, settingsStore);
  const photoStore = createPhotoStore(runtime, settingsStore);
  const clientLog = createClientLog(runtime);
  const systemActions = createActions(runtime);

  await photoStore.ensureStorage();
  await settingsStore.ensureCalendarSourcesSettings();

  const app = createPhotoServerApp({
    runtime,
    calendarService,
    clientLog,
    photoStore,
    settingsStore,
    systemActions
  });

  const server = app.listen(runtime.port, "0.0.0.0", () => {
    console.log(`Photo server listening on http://127.0.0.1:${server.address().port}`);
  });
  globalThis.familyFrameServer = server;

  if (runtime.telegramToken) {
    const telegram = createTelegramService(runtime, photoStore, systemActions);
    telegram.startTelegramPolling().catch((error) => {
      console.error("Telegram polling stopped:", error);
    });
  }
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await startPhotoServer();
}
