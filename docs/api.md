# Timers and routines API

Reference for the timers and routines API. The OpenAPI document (`/api/openapi.json`, from
`server/lib/openapi.mjs`) is authoritative; tests check it against the routes and real responses. Admin
authentication (PIN, API tokens, scopes) is described in the main README.

## Interactive documentation

Open `/api/docs` and enter the admin PIN if one is configured. Swagger UI uses that PIN for **Execute**;
you can switch to an API token under **Authorize**. Each request body has ready-made examples. The OpenAPI
3.1 document at `/api/openapi.json` also requires the PIN or a token with schedule access. Credentials stay
in the page's memory and are forgotten on reload. Swagger UI is served from the local `swagger-ui-dist` package, with no CDN, under a strict
Content Security Policy. Set `FRAME_API_DOCS=false` to turn off `/api/docs` and `/api/openapi.json`.

## Endpoints

Admin endpoints need the PIN or a token when `FRAME_ADMIN_PIN` is set. Bodies are JSON; unknown fields are
rejected. Errors are `{ "error", "code" }` with `400 invalid-input`, `401`, `404 not-found`,
`409 invalid-transition` / `limit-reached` or `429 too-many-attempts` (`403 insufficient-scope` for other admin
endpoints with a `schedule` token). Changes are broadcast on `/api/events` as `timers` /
`routines` events.

| Method and path | Body | Notes |
|---|---|---|
| `GET /api/admin/timers[?includeClosed=true]` | | running, paused and ringing timers |
| `POST /api/admin/timers` | `{ title, durationMs, autoDismissMs?, style?, icon? }` | 201; 409 with 3 active timers |
| `GET /api/admin/timers/:id` | | |
| `PATCH /api/admin/timers/:id` | `{ title?, durationMs?, autoDismissMs?, style?, icon? }` | new duration keeps the start time |
| `POST /api/admin/timers/:id/add-time` | `{ deltaMs }` | may be negative; snoozes a ringing timer |
| `POST /api/admin/timers/:id/pause` · `/resume` | | |
| `POST /api/admin/timers/:id/cancel` | | always removes it, idempotent |
| `GET /api/admin/routines[?includeCancelled=true]` | | |
| `POST /api/admin/routines` | `{ title, time, recurrence, startDate?, endDate?, noticeMinutes?, autoDismissMs?, style?, icon? }` | 201 |
| `GET /api/admin/routines/occurrences[?from&to]` | | ISO instants, default next 24 h, max 31 days |
| `GET` · `PATCH /api/admin/routines/:id` | any create field | `recurrence` is replaced as a whole |
| `POST /api/admin/routines/:id/pause` | `{ resumeOn? }` | `YYYY-MM-DD`; omitted = until resumed |
| `POST /api/admin/routines/:id/resume` · `/cancel` | | cancel is idempotent |
| `PUT` · `DELETE /api/admin/routines/:id/exceptions/:date` | `{ kind: "skipped" \| "dismissed" }` | one occurrence |
| `GET /api/schedule` | | **no PIN**, read-only snapshot for the frame |

`recurrence` is `{ frequency: "daily" }`, `{ frequency: "weekly", weekdays: ["mon", "fri"] }` or
`{ frequency: "monthly", monthDay: 31 }` (last day in shorter months), each with an optional `interval`.
Weekdays are names only. Durations are milliseconds. A finished timer rings for `autoDismissMs`
(default `FRAME_TIMER_AUTO_DISMISS_SECONDS`, 60 s; 0 = until cancelled), then disappears. A routine
occurrence shows a countdown from `noticeMinutes` before its time and stays on screen for its
`autoDismissMs` afterwards (default `FRAME_ROUTINE_AUTO_DISMISS_SECONDS`, 60 s, at least 1 s because the
frame has no touchscreen to dismiss it).

`style` chooses how the countdown is drawn: `disc` (shrinking slice), `sweets` (one block per minute),
`journey` (a snail walking to the icon) or `clock` (clock face with a zone up to the time). New timers and
routines default to `FRAME_TIMER_STYLE` (`disc`) and `FRAME_ROUTINE_STYLE` (`clock`). `icon` is an optional key
such as `pot` or `backpack` (list in `server/lib/schedule-icons.mjs`); unknown keys are shown as an exclamation
mark. At most 3 timers can be active at once, and the frame shows at most 3 items: ringing first, then the
soonest, paused last. Mockups are in `docs/mockups/`.

The frame display reads `GET /api/schedule`, the only schedule endpoint without the PIN: the frame is a
plain browser page and cannot keep a secret. It is read-only and returns the visible timers, the routine
occurrences of the next 24 hours with `showFrom` / `at` / `dismissAt`, and `serverTime`, from which the
frame corrects for a different local clock (`src/frame/lib/clockSync.ts`).

## Schedule events and webhook

The server emits `timer.created`, `timer.finished`, `routine.upcoming` (notice window opens) and `routine.due`. They are sent
on `/api/events` as `schedule` events and, when `FRAME_SCHEDULE_WEBHOOK_URL` is set, POSTed as JSON to that
URL (one attempt, 5 s timeout; `FRAME_SCHEDULE_WEBHOOK_SECRET` is sent as `X-Frame-Webhook-Secret`), e.g. to
let Home Assistant play a sound. A deployment can also pass `startFrameServer({ onScheduleEvent })`.
Each event fires once; events that fall while the server is down are not replayed, except a timer that is
still ringing. The payload is documented under Webhooks in `/api/docs`.
The server sleeps until the next such moment (at most a minute) and re-plans whenever a timer or routine
changes, so events fire on time without polling every second.

## Time zone and language

Routine times are wall-clock times in `FRAME_TIMEZONE` (defaults to the host time zone); set it when the host runs
in UTC. The frame formats its clock, dates and events with `FRAME_TIMEZONE` and `FRAME_LOCALE`, received read-only as
`i18n` in `/api/settings`, rather than with the browser's own settings, so the clock and routine times agree.

## Examples

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Pasta is ready","durationMs":600000}' http://127.0.0.1:8787/api/admin/timers
curl -H "X-Frame-Admin-Pin: $PIN" -H "Content-Type: application/json" \
  -d '{"title":"Take kids to school","time":"08:10","recurrence":{"frequency":"weekly","weekdays":["mon","tue","wed","thu","fri"]}}' \
  http://127.0.0.1:8787/api/admin/routines
```

## Frame-side types

The frame's TypeScript types for this API (`src/lib/api-schema.ts`) are generated from the OpenAPI document:
run `npm run generate:api-types` after changing the API. `test/unit/api-types.test.mjs` fails while the
generated file is out of date, and `tsc` then points at frame code using fields that changed.
