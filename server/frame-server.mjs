import fs from "node:fs/promises";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { adminAuthWarnings } from "./lib/admin-auth.mjs";
import { createApiTokenStore } from "./lib/api-tokens.mjs";
import { createFrameServerApp } from "./lib/app.mjs";
import { openDatabase } from "./lib/database.mjs";
import { createCalendarService } from "./lib/calendar-service.mjs";
import { createClientLog } from "./lib/client-log.mjs";
import { createRuntimeConfig, loadDotEnv } from "./lib/env.mjs";
import { createPhotoStore } from "./lib/photos.mjs";
import { createScheduleEvents } from "./lib/schedule-events.mjs";
import { createScheduleNotifier } from "./lib/schedule-notifier.mjs";
import { createScheduleStore } from "./lib/schedule-store.mjs";
import { createWebhookSink } from "./lib/schedule-webhook.mjs";
import { createSettingsStore } from "./lib/settings-store.mjs";
import { createSystemActions } from "./lib/system-actions.mjs";
import { createTelegramService } from "./lib/telegram.mjs";

/**
 * Starts the Family Frame server: the frame and admin apps, photos, calendars, settings, timers and routines,
 * the API docs and the frame event stream.
 *
 * @param options.createActions    device operations (display power, refresh); see system-actions.mjs
 * @param options.onScheduleEvent  optional hook called with every schedule event (timer.created,
 *                                 timer.finished, routine.upcoming, routine.due), e.g. to play a sound
 */
export async function startFrameServer({
  createActions = createSystemActions,
  defaultConfigFile = "",
  onScheduleEvent = null
} = {}) {
  await loadDotEnv();

  const runtime = createRuntimeConfig();
  if (!runtime.configFile) runtime.configFile = defaultConfigFile;
  await fs.mkdir(runtime.dataDir, { recursive: true });
  // One connection to settings.sqlite, shared by the settings, schedule and token stores.
  const db = openDatabase(runtime.settingsDbPath);
  let notifier;
  let server;
  try {
    const settingsStore = createSettingsStore(runtime, () => calendarService.clearCalendarCache(), { db });
    const calendarService = createCalendarService(runtime, settingsStore);
    const photoStore = createPhotoStore(runtime, settingsStore);
    const clientLog = createClientLog(runtime);
    const systemActions = createActions(runtime);

    await photoStore.ensureStorage();
    await settingsStore.ensureCalendarSourcesSettings();
    const scheduleStore = createScheduleStore({
      db,
      timeZone: runtime.timeZone,
      timerAutoDismissMs: runtime.timerAutoDismissMs,
      routineAutoDismissMs: runtime.routineAutoDismissMs,
      timerStyle: runtime.timerStyle,
      routineStyle: runtime.routineStyle
    });
    const apiTokens = createApiTokenStore({ db });
    apiTokens.ensureSchema();
    for (const warning of adminAuthWarnings(runtime)) console.warn(`Warning: ${warning}`);
    const scheduleEvents = createScheduleEvents();
    if (runtime.scheduleWebhook) scheduleEvents.subscribe(createWebhookSink(runtime.scheduleWebhook));
    if (onScheduleEvent) scheduleEvents.subscribe(onScheduleEvent);
    scheduleStore.ensureSchema();

    const app = createFrameServerApp({
      runtime,
      calendarService,
      clientLog,
      photoStore,
      settingsStore,
      systemActions,
      scheduleStore,
      scheduleEvents,
      apiTokens
    });

    notifier = createScheduleNotifier({ store: scheduleStore, dispatch: scheduleEvents.emit });
    notifier.start();

    server = app.listen(runtime.port, "0.0.0.0");
    await once(server, "listening");
    server.once("close", () => {
      notifier.stop();
      db.close();
    });
    console.log(`Family Frame server listening on http://127.0.0.1:${server.address().port}`);
    if (runtime.telegramToken) {
      const telegram = createTelegramService(runtime, photoStore, systemActions);
      telegram.startTelegramPolling().catch((error) => {
        console.error("Telegram polling stopped:", error);
      });
    }
  } catch (error) {
    notifier?.stop();
    db.close();
    throw error;
  }
  globalThis.familyFrameServer = server;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await startFrameServer();
}
