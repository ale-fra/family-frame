import { createPhotoServerApp } from "./lib/app.mjs";
import { createCalendarService } from "./lib/calendar-service.mjs";
import { createClientLog } from "./lib/client-log.mjs";
import { createRuntimeConfig, loadDotEnv } from "./lib/env.mjs";
import { createPhotoStore } from "./lib/photos.mjs";
import { createSettingsStore } from "./lib/settings-store.mjs";
import { createSystemActions } from "./lib/system-actions.mjs";
import { createTelegramService } from "./lib/telegram.mjs";

await loadDotEnv();

const runtime = createRuntimeConfig();
const settingsStore = createSettingsStore(runtime, () => calendarService.clearCalendarCache());
const calendarService = createCalendarService(runtime, settingsStore);
const photoStore = createPhotoStore(runtime, settingsStore);
const clientLog = createClientLog(runtime);
const systemActions = createSystemActions(runtime);

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
  console.log(`Photo server listening on http://127.0.0.1:${runtime.port}`);
});
globalThis.familyFrameServer = server;

if (runtime.telegramToken) {
  const telegram = createTelegramService(runtime, photoStore, systemActions);
  telegram.startTelegramPolling().catch((error) => {
    console.error("Telegram polling stopped:", error);
  });
}
