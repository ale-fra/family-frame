// OpenAPI 3.1 description of the timers and routines API, served at /api/openapi.json and rendered by
// Swagger UI at /api/docs. Tests check it against the Express routes and against real responses,
// so update it together with schedule-routes.mjs / schedule-utils.mjs.
import { createRequire } from "node:module";
import { SCHEDULE_ICON_KEYS } from "./schedule-icons.mjs";
import {
  DEFAULT_NOTICE_MINUTES,
  ICON_KEY_MAX_LENGTH,
  MAX_ACTIVE_TIMERS,
  SCHEDULE_STYLES,
  MAX_INTERVAL,
  MAX_NOTICE_MINUTES,
  MAX_ROUTINE_AUTO_DISMISS_MS,
  MIN_ROUTINE_AUTO_DISMISS_MS,
  MAX_TIMER_AUTO_DISMISS_MS,
  TIMER_MAX_DURATION_MS,
  TIMER_MIN_DURATION_MS,
  TITLE_MAX_LENGTH
} from "./schedule-utils.mjs";

const { version } = createRequire(import.meta.url)("../../package.json");

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const json = (schema, examples) => ({ "application/json": { schema, ...(examples ? { examples } : {}) } });
const dateTime = { type: "string", format: "date-time" };
const nullableDateTime = { type: ["string", "null"], format: "date-time" };
const localDate = { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$", examples: ["2025-09-15"] };
const clockTime = { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$", examples: ["08:10"] };
const weekdayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const caseInsensitive = (word) => [...word].map((letter) => `[${letter.toUpperCase()}${letter}]`).join("");

// Every protected operation can also answer 429 after too many wrong credentials.
const responses = (...codes) => Object.fromEntries([...codes, ...(codes.includes(401) ? [429] : [])].map((code) => [String(code), {
  $ref: `#/components/responses/${{ 400: "BadRequest", 401: "Unauthorized", 404: "NotFound", 409: "Conflict", 429: "TooManyAttempts" }[code]}`
}]));
const timerResponse = (description, status = 200) => ({ [status]: { description, content: json(ref("TimerEnvelope")) } });
const routineResponse = (description, status = 200) => ({ [status]: { description, content: json(ref("RoutineEnvelope")) } });

const timerIdParam = { $ref: "#/components/parameters/TimerId" };
const styleField = (kind, envName, fallback) => ({
  ...ref("Style"),
  description: `How the ${kind} countdown is drawn. Defaults to ${envName} (${fallback}).`
});
const iconField = { ...ref("IconInput") };
const routineIdParam = { $ref: "#/components/parameters/RoutineId" };

function recurrenceSchemas(weekday, { output }) {
  const interval = (frequency) => ({
    type: "integer",
    minimum: 1,
    maximum: MAX_INTERVAL[frequency],
    ...(output ? {} : { default: 1 }),
    description: `Every N ${{ daily: "days", weekly: "weeks", monthly: "months" }[frequency]}, counted from startDate.`
  });
  const variant = (frequency, extra = {}, extraRequired = []) => ({
    type: "object",
    additionalProperties: false,
    required: ["frequency", ...(output ? ["interval"] : []), ...extraRequired],
    properties: { frequency: { const: frequency }, interval: interval(frequency), ...extra }
  });
  return {
    daily: variant("daily"),
    weekly: variant("weekly", {
      weekdays: {
        type: "array",
        minItems: 1,
        items: weekday,
        description: "Three-letter weekday names. Numbers are rejected: 0–6 is ambiguous.",
        examples: [["mon", "tue", "wed", "thu", "fri"]]
      }
    }, ["weekdays"]),
    monthly: variant("monthly", {
      monthDay: {
        type: "integer",
        minimum: 1,
        maximum: 31,
        description: "Day of the month; 29–31 fall on the last day in shorter months."
      }
    }, ["monthDay"])
  };
}

const recurrenceIn = recurrenceSchemas(ref("WeekdayInput"), { output: false });
const recurrenceOut = recurrenceSchemas(ref("Weekday"), { output: true });

const routineFields = {
  title: { type: "string", minLength: 1, maxLength: TITLE_MAX_LENGTH, examples: ["Take kids to school"] },
  time: { ...clockTime, description: "Local wall-clock time (24 h) in the frame time zone." },
  recurrence: ref("RecurrenceInput"),
  startDate: { ...localDate, description: "First possible date; anchors the interval. Defaults to today." },
  endDate: { ...nullable(localDate), description: "Last possible date (inclusive); null = no end." },
  noticeMinutes: {
    type: "integer",
    minimum: 0,
    maximum: MAX_NOTICE_MINUTES,
    default: DEFAULT_NOTICE_MINUTES,
    description: "How many minutes before each occurrence the frame starts showing the countdown."
  },
  autoDismissMs: {
    type: "integer",
    minimum: MIN_ROUTINE_AUTO_DISMISS_MS,
    maximum: MAX_ROUTINE_AUTO_DISMISS_MS,
    description: "How long each occurrence stays on screen after its time, like a ringing timer. " +
      "Defaults to FRAME_ROUTINE_AUTO_DISMISS_SECONDS (60 s)."
  },
  style: styleField("routine", "FRAME_ROUTINE_STYLE", "clock"),
  icon: iconField
};

const timerFields = {
  title: { type: "string", minLength: 1, maxLength: TITLE_MAX_LENGTH, examples: ["Pasta is ready"] },
  durationMs: {
    type: "integer",
    minimum: TIMER_MIN_DURATION_MS,
    maximum: TIMER_MAX_DURATION_MS,
    description: "Total countdown in milliseconds (10 minutes = 600000)."
  },
  autoDismissMs: {
    type: "integer",
    minimum: 0,
    maximum: MAX_TIMER_AUTO_DISMISS_MS,
    description: "How long the timer rings once finished before disappearing; 0 = until cancelled. " +
      "Defaults to FRAME_TIMER_AUTO_DISMISS_SECONDS (60 s)."
  },
  style: styleField("timer", "FRAME_TIMER_STYLE", "disc"),
  icon: iconField
};

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Family Frame API",
    version,
    description: [
      "Timers and routine appointments shown on the family frame.",
      "",
      "**Authentication:** click **Authorize** and enter either the admin PIN (`FRAME_ADMIN_PIN`, sent as the",
      "`X-Frame-Admin-Pin` header) or an API token (`npm run token -- create <name>` on the device, sent as",
      "`Authorization: Bearer <token>`). Tools that only support Basic auth can send the token as the password.",
      "Credentials are kept in memory only and forgotten when the page is reloaded. 10 wrong attempts within",
      "15 minutes block the device for the rest of that window (429). When no PIN is configured, the API is open.",
      "",
      "**Conventions:** durations are milliseconds, instants are ISO 8601 UTC, routine times and dates are local",
      "to the frame time zone (`FRAME_TIMEZONE`). Unknown fields are rejected. Errors are `{ error, code }`.",
      "Every change is also broadcast on the `/api/events` server-sent event stream (`timers` / `routines`).",
      "",
      "**Frame display:** `GET /api/schedule` is the only operation without the PIN. It is read-only and returns",
      "what the frame shows, plus `serverTime` to correct for a different local clock.",
      "",
      "**Webhook:** set `FRAME_SCHEDULE_WEBHOOK_URL` to receive `timer.created`, `timer.finished`,",
      "`routine.upcoming` and `routine.due` events (see Webhooks below). They are also sent on `/api/events`",
      "as `schedule` events.",
      "",
      `**Limits:** at most ${MAX_ACTIVE_TIMERS} active timers (running, paused or ringing); the frame shows at most`,
      `${MAX_ACTIVE_TIMERS} items at once, ringing first.`
    ].join("\n")
  },
  servers: [{ url: "/", description: "This frame" }],
  // Alternatives: either the PIN or a token.
  security: [{ AdminPin: [] }, { BearerToken: [] }],
  tags: [
    {
      name: "Frame",
      description: "Read-only data for the frame display. No PIN."
    },
    {
      name: "Timers",
      description: "One-off countdowns. Lifecycle: `running` ⇄ `paused`; `running` → `finished` (ringing) → " +
        "`dismissed` after `autoDismissMs`; `cancel` always removes the timer."
    },
    {
      name: "Routines",
      description: "Recurring appointments at a local time. Lifecycle: `active` ⇄ `paused` (optionally until " +
        "`resumeOn`) → `cancelled`. Single occurrences can be skipped or dismissed."
    }
  ],
  paths: {
    "/api/schedule": {
      get: {
        tags: ["Frame"],
        operationId: "getPublicSchedule",
        summary: "What the frame should show",
        description: "Running, paused and ringing timers, plus routine occurrences that are on screen now " +
          "(until `dismissAt`) or become visible within 24 hours (`showFrom`). Skipped and dismissed " +
          "occurrences are left out. The frame works out each item's phase from these times and `serverTime`.",
        security: [],
        responses: {
          200: { description: "Schedule snapshot", content: json(ref("PublicSchedule")) }
        }
      }
    },
    "/api/admin/timers": {
      get: {
        tags: ["Timers"],
        operationId: "listTimers",
        summary: "List timers",
        description: "Running, paused and ringing timers, oldest first.",
        parameters: [{
          name: "includeClosed",
          in: "query",
          description: "Also return cancelled and dismissed timers (kept 30 days).",
          schema: { type: "boolean", default: false }
        }],
        responses: {
          200: { description: "Timers", content: json(ref("TimerList")) },
          ...responses(401)
        }
      },
      post: {
        tags: ["Timers"],
        operationId: "createTimer",
        summary: "Start a timer",
        requestBody: {
          required: true,
          content: json(ref("TimerCreate"), {
            pasta: { summary: "Pasta in 10 minutes", value: { title: "Pasta is ready", durationMs: 600000 } },
            quick: { summary: "30 seconds, rings 5 s", value: { title: "Test", durationMs: 30000, autoDismissMs: 5000 } },
            persistent: { summary: "Rings until cancelled", value: { title: "Oven", durationMs: 2700000, autoDismissMs: 0 } },
            sweets: {
              summary: "Teeth, 3 min, as sweets",
              value: { title: "Brush teeth", durationMs: 180000, style: "sweets", icon: "sparkles" }
            },
            journey: {
              summary: "Pasta with the snail",
              value: { title: "Pasta is ready", durationMs: 600000, style: "journey", icon: "pot" }
            }
          })
        },
        responses: {
          ...timerResponse("Created, running", 201),
          ...responses(400, 401),
          409: { description: `Already ${MAX_ACTIVE_TIMERS} active timers (code limit-reached)`, content: json(ref("Error")) }
        }
      }
    },
    "/api/admin/timers/{id}": {
      parameters: [timerIdParam],
      get: {
        tags: ["Timers"],
        operationId: "getTimer",
        summary: "Get a timer",
        responses: { ...timerResponse("Timer"), ...responses(401, 404) }
      },
      patch: {
        tags: ["Timers"],
        operationId: "updateTimer",
        summary: "Rename or change the duration",
        description: "A new `durationMs` keeps the start time: the deadline moves by the difference " +
          "(\"I meant 5 minutes, not 15\"). If it has already elapsed the timer rings now. Closed timers → 409.",
        requestBody: {
          required: true,
          content: json(ref("TimerPatch"), {
            shorter: { summary: "I meant 5 minutes", value: { durationMs: 300000 } },
            rename: { summary: "Rename", value: { title: "Spaghetti" } },
            ringForever: { summary: "Ring until cancelled", value: { autoDismissMs: 0 } }
          })
        },
        responses: { ...timerResponse("Updated timer"), ...responses(400, 401, 404, 409) }
      }
    },
    "/api/admin/timers/{id}/add-time": {
      parameters: [timerIdParam],
      post: {
        tags: ["Timers"],
        operationId: "addTimerTime",
        summary: "Add or remove time",
        description: "Changes the duration by `deltaMs`, like PATCH. On a ringing timer the extra time counts " +
          "from now (snooze).",
        requestBody: {
          required: true,
          content: json(ref("AddTime"), {
            plusOne: { summary: "+1 minute", value: { deltaMs: 60000 } },
            minusTwo: { summary: "-2 minutes", value: { deltaMs: -120000 } }
          })
        },
        responses: { ...timerResponse("Updated timer"), ...responses(400, 401, 404, 409) }
      }
    },
    "/api/admin/timers/{id}/pause": {
      parameters: [timerIdParam],
      post: {
        tags: ["Timers"],
        operationId: "pauseTimer",
        summary: "Pause a running timer",
        responses: { ...timerResponse("Paused timer"), ...responses(401, 404, 409) }
      }
    },
    "/api/admin/timers/{id}/resume": {
      parameters: [timerIdParam],
      post: {
        tags: ["Timers"],
        operationId: "resumeTimer",
        summary: "Resume a paused timer",
        responses: { ...timerResponse("Running timer"), ...responses(401, 404, 409) }
      }
    },
    "/api/admin/timers/{id}/cancel": {
      parameters: [timerIdParam],
      post: {
        tags: ["Timers"],
        operationId: "cancelTimer",
        summary: "Cancel or silence a timer",
        description: "Running/paused → `cancelled`, ringing → `dismissed`. Idempotent.",
        responses: { ...timerResponse("Closed timer"), ...responses(401, 404) }
      }
    },
    "/api/admin/routines": {
      get: {
        tags: ["Routines"],
        operationId: "listRoutines",
        summary: "List routines",
        description: "Sorted by time of day.",
        parameters: [{
          name: "includeCancelled",
          in: "query",
          description: "Also return cancelled routines.",
          schema: { type: "boolean", default: false }
        }],
        responses: {
          200: { description: "Routines", content: json(ref("RoutineList")) },
          ...responses(401)
        }
      },
      post: {
        tags: ["Routines"],
        operationId: "createRoutine",
        summary: "Create a routine",
        requestBody: {
          required: true,
          content: json(ref("RoutineCreate"), {
            schoolRun: {
              summary: "School run, weekdays 08:10",
              value: {
                title: "Take kids to school",
                time: "08:10",
                recurrence: { frequency: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"] },
                icon: "backpack"
              }
            },
            everyOtherDay: {
              summary: "Water the plants every 2 days",
              value: { title: "Water the plants", time: "19:00", recurrence: { frequency: "daily", interval: 2 } }
            },
            monthly: {
              summary: "Rent on the last day of the month",
              value: { title: "Pay rent", time: "09:00", recurrence: { frequency: "monthly", monthDay: 31 }, noticeMinutes: 60 }
            },
            schoolYear: {
              summary: "Swimming, Tuesdays until June",
              value: {
                title: "Swimming",
                time: "17:30",
                recurrence: { frequency: "weekly", weekdays: ["tue"] },
                startDate: "2025-09-16",
                endDate: "2026-06-09",
                noticeMinutes: 30
              }
            }
          })
        },
        responses: { ...routineResponse("Created, active", 201), ...responses(400, 401) }
      }
    },
    "/api/admin/routines/occurrences": {
      get: {
        tags: ["Routines"],
        operationId: "listRoutineOccurrences",
        summary: "Upcoming occurrences of all routines",
        description: "Occurrences in the window (from, to], sorted by time. Skipped ones are left out; " +
          "dismissed ones are flagged.",
        parameters: [
          {
            name: "from",
            in: "query",
            description: "Window start with offset, e.g. `2025-09-15T00:00:00Z`. Default: now.",
            schema: dateTime
          },
          {
            name: "to",
            in: "query",
            description: "Window end. Default: `from` + 24 h. At most 31 days after `from`.",
            schema: dateTime
          }
        ],
        responses: {
          200: { description: "Occurrences", content: json(ref("OccurrenceList")) },
          ...responses(400, 401)
        }
      }
    },
    "/api/admin/routines/{id}": {
      parameters: [routineIdParam],
      get: {
        tags: ["Routines"],
        operationId: "getRoutine",
        summary: "Get a routine",
        responses: { ...routineResponse("Routine"), ...responses(401, 404) }
      },
      patch: {
        tags: ["Routines"],
        operationId: "updateRoutine",
        summary: "Edit a routine",
        description: "Send only the fields to change. `recurrence` is replaced as a whole; exceptions on dates " +
          "the new schedule no longer has are removed. The status is unchanged. Cancelled routines → 409.",
        requestBody: {
          required: true,
          content: json(ref("RoutinePatch"), {
            laterTime: { summary: "Move to 08:30", value: { time: "08:30" } },
            fewerDays: {
              summary: "Only Tuesday and Thursday",
              value: { recurrence: { frequency: "weekly", weekdays: ["tue", "thu"] } }
            },
            noEnd: { summary: "Remove the end date", value: { endDate: null } }
          })
        },
        responses: { ...routineResponse("Updated routine"), ...responses(400, 401, 404, 409) }
      }
    },
    "/api/admin/routines/{id}/pause": {
      parameters: [routineIdParam],
      post: {
        tags: ["Routines"],
        operationId: "pauseRoutine",
        summary: "Pause a routine",
        description: "Without a body the routine is paused until resumed. With `resumeOn` it restarts " +
          "automatically on that local date. Pausing again changes the date.",
        requestBody: {
          required: false,
          content: json(ref("PauseRoutine"), {
            indefinitely: { summary: "Until resumed", value: {} },
            holidays: { summary: "Summer holidays", value: { resumeOn: "2026-09-14" } }
          })
        },
        responses: { ...routineResponse("Paused routine"), ...responses(400, 401, 404, 409) }
      }
    },
    "/api/admin/routines/{id}/resume": {
      parameters: [routineIdParam],
      post: {
        tags: ["Routines"],
        operationId: "resumeRoutine",
        summary: "Resume a paused routine",
        responses: { ...routineResponse("Active routine"), ...responses(401, 404, 409) }
      }
    },
    "/api/admin/routines/{id}/cancel": {
      parameters: [routineIdParam],
      post: {
        tags: ["Routines"],
        operationId: "cancelRoutine",
        summary: "Cancel a routine",
        description: "Keeps the record for history but hides it from the frame. Idempotent.",
        responses: { ...routineResponse("Cancelled routine"), ...responses(401, 404) }
      }
    },
    "/api/admin/routines/{id}/exceptions/{date}": {
      parameters: [routineIdParam, { $ref: "#/components/parameters/OccurrenceDate" }],
      put: {
        tags: ["Routines"],
        operationId: "setRoutineException",
        summary: "Skip or dismiss one occurrence",
        description: "`skipped`: it does not happen (\"no school tomorrow\"). `dismissed`: it happens but was " +
          "acknowledged. The date must be on the routine's schedule.",
        requestBody: {
          required: true,
          content: json(ref("ExceptionInput"), {
            skip: { summary: "Skip", value: { kind: "skipped" } },
            dismiss: { summary: "Dismiss", value: { kind: "dismissed" } }
          })
        },
        responses: { ...routineResponse("Routine with the exception"), ...responses(400, 401, 404, 409) }
      },
      delete: {
        tags: ["Routines"],
        operationId: "clearRoutineException",
        summary: "Restore one occurrence",
        description: "Removes a skip or dismissal. Idempotent.",
        responses: { ...routineResponse("Routine without the exception"), ...responses(400, 401, 404) }
      }
    }
  },
  webhooks: {
    scheduleEvent: {
      post: {
        summary: "Schedule event (outgoing)",
        description: "Sent by the frame to FRAME_SCHEDULE_WEBHOOK_URL when a timer is created or starts ringing, " +
          "a routine enters its notice window or a routine is due. One attempt, 5 s timeout. With " +
          "FRAME_SCHEDULE_WEBHOOK_SECRET set, the secret is sent in the X-Frame-Webhook-Secret header. " +
          "Events that happen while the server is down are not replayed.",
        parameters: [{
          name: "X-Frame-Webhook-Secret",
          in: "header",
          required: false,
          description: "FRAME_SCHEDULE_WEBHOOK_SECRET, when configured.",
          schema: { type: "string" }
        }],
        requestBody: {
          required: true,
          content: json(ref("ScheduleEvent"), {
            timer: {
              summary: "Timer finished",
              value: {
                type: "timer.finished",
                at: "2025-09-12T07:10:00.000Z",
                timer: {
                  id: "8d9c5f0e-2a8f-4c55-9d0c-3f0f0f6d2b1a", title: "Pasta is ready", durationMs: 600000,
                  status: "finished", remainingMs: 0, endsAt: "2025-09-12T07:10:00.000Z", autoDismissMs: 60000,
                  style: "disc", icon: "pot",
                  finishedAt: "2025-09-12T07:10:00.000Z", dismissAt: "2025-09-12T07:11:00.000Z", closedAt: null,
                  createdAt: "2025-09-12T07:00:00.000Z", updatedAt: "2025-09-12T07:10:00.000Z"
                }
              }
            },
            routine: {
              summary: "Routine due",
              value: {
                type: "routine.due",
                at: "2025-09-15T06:10:00.000Z",
                occurrence: {
                  routineId: "0b7f1a52-7a43-4c7e-9d8e-1e1f4b8e9c11", title: "Take kids to school", date: "2025-09-15",
                  at: "2025-09-15T06:10:00.000Z", showFrom: "2025-09-15T05:55:00.000Z",
                  dismissAt: "2025-09-15T06:11:00.000Z", noticeMinutes: 15, style: "clock", icon: "backpack",
                  dismissed: false
                }
              }
            }
          })
        },
        responses: { "2XX": { description: "Received. Any other status is logged." } }
      }
    }
  },
  components: {
    securitySchemes: {
      AdminPin: {
        type: "apiKey",
        in: "header",
        name: "X-Frame-Admin-Pin",
        description: "The admin PIN configured with FRAME_ADMIN_PIN."
      },
      BearerToken: {
        type: "http",
        scheme: "bearer",
        description: "API token created on the device with `npm run token -- create <name>` (starts with ff_). " +
          "Default scope `schedule` covers every operation documented here; `--scope admin` also covers the " +
          "rest of the admin API (photos, settings, display)."
      }
    },
    parameters: {
      TimerId: { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Timer id" },
      RoutineId: { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Routine id" },
      OccurrenceDate: {
        name: "date",
        in: "path",
        required: true,
        description: "Local date of the occurrence",
        schema: localDate
      }
    },
    responses: {
      BadRequest: { description: "Invalid input", content: json(ref("Error")) },
      Unauthorized: {
        description: "Missing or wrong PIN or token",
        headers: { "WWW-Authenticate": { description: 'Always `Bearer realm="family-frame"`', schema: { type: "string" } } },
        content: json(ref("UnauthorizedError"))
      },
      TooManyAttempts: {
        description: "Too many wrong attempts from this device (code too-many-attempts)",
        headers: { "Retry-After": { description: "Seconds until the block ends", schema: { type: "integer" } } },
        content: json(ref("Error"))
      },
      NotFound: { description: "Unknown id", content: json(ref("Error")) },
      Conflict: { description: "Not allowed in the current state", content: json(ref("Error")) }
    },
    schemas: {
      Error: {
        type: "object",
        additionalProperties: false,
        required: ["error", "code"],
        properties: {
          error: { type: "string", description: "Human-readable message naming the offending field." },
          code: { enum: ["invalid-input", "not-found", "invalid-transition", "limit-reached", "too-many-attempts", "internal"] }
        }
      },
      UnauthorizedError: {
        type: "object",
        additionalProperties: false,
        required: ["error"],
        properties: { error: { const: "Admin PIN or API token required" } }
      },
      TimerCreate: {
        type: "object",
        additionalProperties: false,
        required: ["title", "durationMs"],
        properties: timerFields
      },
      TimerPatch: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: timerFields
      },
      AddTime: {
        type: "object",
        additionalProperties: false,
        required: ["deltaMs"],
        properties: {
          deltaMs: {
            type: "integer",
            not: { const: 0 },
            description: "Milliseconds to add (negative to remove). The resulting duration must stay within " +
              `${TIMER_MIN_DURATION_MS}–${TIMER_MAX_DURATION_MS}.`
          }
        }
      },
      Timer: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "title", "durationMs", "status", "remainingMs", "endsAt", "autoDismissMs", "style", "icon",
          "finishedAt", "dismissAt", "closedAt", "createdAt", "updatedAt"
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          durationMs: { type: "integer", description: "Total countdown, including added time." },
          status: {
            enum: ["running", "paused", "finished", "cancelled", "dismissed"],
            description: "`finished` = ringing."
          },
          remainingMs: { type: "integer", minimum: 0, description: "At the time of the response." },
          endsAt: { ...nullableDateTime, description: "Deadline while running (when it rang once finished); null while paused." },
          autoDismissMs: { type: "integer", minimum: 0 },
          style: ref("Style"),
          icon: ref("Icon"),
          finishedAt: nullableDateTime,
          dismissAt: { ...nullableDateTime, description: "When a ringing timer will disappear; null otherwise." },
          closedAt: nullableDateTime,
          createdAt: dateTime,
          updatedAt: dateTime
        }
      },
      TimerEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["timer"],
        properties: { timer: ref("Timer") }
      },
      TimerList: {
        type: "object",
        additionalProperties: false,
        required: ["timers"],
        properties: { timers: { type: "array", items: ref("Timer") } }
      },
      Weekday: { enum: weekdayNames },
      WeekdayInput: {
        type: "string",
        pattern: `^(${weekdayNames.map(caseInsensitive).join("|")})$`,
        description: "mon, tue, wed, thu, fri, sat or sun (case-insensitive).",
        examples: ["mon"]
      },
      DailyRecurrenceInput: recurrenceIn.daily,
      WeeklyRecurrenceInput: recurrenceIn.weekly,
      MonthlyRecurrenceInput: recurrenceIn.monthly,
      // Without a mapping, OpenAPI takes the schema NAME as the discriminator value: always map explicitly.
      RecurrenceInput: {
        type: "object",
        oneOf: [ref("DailyRecurrenceInput"), ref("WeeklyRecurrenceInput"), ref("MonthlyRecurrenceInput")],
        discriminator: {
          propertyName: "frequency",
          mapping: {
            daily: "#/components/schemas/DailyRecurrenceInput",
            weekly: "#/components/schemas/WeeklyRecurrenceInput",
            monthly: "#/components/schemas/MonthlyRecurrenceInput"
          }
        }
      },
      DailyRecurrence: recurrenceOut.daily,
      WeeklyRecurrence: recurrenceOut.weekly,
      MonthlyRecurrence: recurrenceOut.monthly,
      Recurrence: {
        type: "object",
        oneOf: [ref("DailyRecurrence"), ref("WeeklyRecurrence"), ref("MonthlyRecurrence")],
        discriminator: {
          propertyName: "frequency",
          mapping: {
            daily: "#/components/schemas/DailyRecurrence",
            weekly: "#/components/schemas/WeeklyRecurrence",
            monthly: "#/components/schemas/MonthlyRecurrence"
          }
        }
      },
      RoutineCreate: {
        type: "object",
        additionalProperties: false,
        required: ["title", "time", "recurrence"],
        properties: routineFields
      },
      RoutinePatch: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: routineFields
      },
      PauseRoutine: {
        type: "object",
        additionalProperties: false,
        properties: {
          resumeOn: { ...nullable(localDate), description: "Future local date on which the routine restarts." }
        }
      },
      ExceptionInput: {
        type: "object",
        additionalProperties: false,
        required: ["kind"],
        properties: { kind: { enum: ["skipped", "dismissed"] } }
      },
      RoutineException: {
        type: "object",
        additionalProperties: false,
        required: ["date", "kind"],
        properties: { date: localDate, kind: { enum: ["skipped", "dismissed"] } }
      },
      NextOccurrence: {
        type: "object",
        additionalProperties: false,
        required: ["date", "at", "dismissed"],
        properties: { date: localDate, at: dateTime, dismissed: { type: "boolean" } }
      },
      Routine: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "title", "time", "recurrence", "startDate", "endDate", "noticeMinutes", "autoDismissMs", "style", "icon",
          "status", "resumeOn",
          "cancelledAt", "createdAt", "updatedAt", "timeZone", "exceptions", "nextOccurrence"
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          time: clockTime,
          recurrence: ref("Recurrence"),
          startDate: localDate,
          endDate: nullable(localDate),
          noticeMinutes: { type: "integer", minimum: 0 },
          autoDismissMs: { type: "integer", minimum: MIN_ROUTINE_AUTO_DISMISS_MS },
          style: ref("Style"),
          icon: ref("Icon"),
          status: { enum: ["active", "paused", "cancelled"] },
          resumeOn: nullable(localDate),
          cancelledAt: nullableDateTime,
          createdAt: dateTime,
          updatedAt: dateTime,
          timeZone: { type: "string", examples: ["Europe/Rome"] },
          exceptions: { type: "array", items: ref("RoutineException"), description: "From today onwards." },
          nextOccurrence: { ...nullable(ref("NextOccurrence")), description: "null when paused without a date, cancelled or ended." }
        }
      },
      RoutineEnvelope: {
        type: "object",
        additionalProperties: false,
        required: ["routine"],
        properties: { routine: ref("Routine") }
      },
      RoutineList: {
        type: "object",
        additionalProperties: false,
        required: ["routines"],
        properties: { routines: { type: "array", items: ref("Routine") } }
      },
      Occurrence: {
        type: "object",
        additionalProperties: false,
        required: ["routineId", "title", "date", "at", "showFrom", "dismissAt", "noticeMinutes", "style", "icon", "dismissed"],
        properties: {
          routineId: { type: "string", format: "uuid" },
          title: { type: "string" },
          date: { ...localDate, description: "Local date of the occurrence." },
          at: { ...dateTime, description: "When it is due." },
          showFrom: { ...dateTime, description: "at − noticeMinutes: when the frame starts the countdown." },
          dismissAt: { ...dateTime, description: "at + autoDismissMs: when it leaves the screen." },
          noticeMinutes: { type: "integer", minimum: 0 },
          style: ref("Style"),
          icon: ref("Icon"),
          dismissed: { type: "boolean", description: "Acknowledged through a `dismissed` exception." }
        }
      },
      PublicSchedule: {
        type: "object",
        additionalProperties: false,
        required: ["serverTime", "timeZone", "timers", "routines"],
        properties: {
          serverTime: { ...dateTime, description: "Server clock when the response was built." },
          timeZone: { type: "string", examples: ["Europe/Rome"] },
          timers: { type: "array", items: ref("Timer"), description: "Running, paused and ringing timers." },
          routines: { type: "array", items: ref("Occurrence"), description: "Sorted by time." }
        }
      },
      Style: {
        enum: SCHEDULE_STYLES,
        description: "`disc`: shrinking coloured slice · `sweets`: one block per minute · `journey`: a snail walking " +
          "to the goal · `clock`: clock face with a zone up to the time."
      },
      IconInput: {
        type: ["string", "null"],
        pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
        maxLength: ICON_KEY_MAX_LENGTH,
        description: `Icon key; null = default icon. Known keys: ${SCHEDULE_ICON_KEYS.join(", ")}. ` +
          "Other well-formed keys are accepted and shown as an exclamation mark.",
        examples: ["pot"]
      },
      Icon: { type: ["string", "null"], description: "Icon key, or null for the default icon." },
      TimerCreatedEvent: {
        type: "object",
        additionalProperties: false,
        required: ["type", "at", "timer"],
        properties: {
          type: { const: "timer.created" },
          at: { ...dateTime, description: "When it was created." },
          timer: ref("Timer")
        }
      },
      TimerFinishedEvent: {
        type: "object",
        additionalProperties: false,
        required: ["type", "at", "timer"],
        properties: {
          type: { const: "timer.finished" },
          at: { ...dateTime, description: "When it started ringing." },
          timer: ref("Timer")
        }
      },
      RoutineUpcomingEvent: {
        type: "object",
        additionalProperties: false,
        required: ["type", "at", "occurrence"],
        properties: {
          type: { const: "routine.upcoming" },
          at: { ...dateTime, description: "showFrom: the notice window opened." },
          occurrence: ref("Occurrence")
        }
      },
      RoutineDueEvent: {
        type: "object",
        additionalProperties: false,
        required: ["type", "at", "occurrence"],
        properties: {
          type: { const: "routine.due" },
          at: { ...dateTime, description: "The occurrence time." },
          occurrence: ref("Occurrence")
        }
      },
      ScheduleEvent: {
        type: "object",
        oneOf: [ref("TimerCreatedEvent"), ref("TimerFinishedEvent"), ref("RoutineUpcomingEvent"), ref("RoutineDueEvent")],
        discriminator: {
          propertyName: "type",
          mapping: {
            "timer.created": "#/components/schemas/TimerCreatedEvent",
            "timer.finished": "#/components/schemas/TimerFinishedEvent",
            "routine.upcoming": "#/components/schemas/RoutineUpcomingEvent",
            "routine.due": "#/components/schemas/RoutineDueEvent"
          }
        }
      },
      OccurrenceList: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "timeZone", "occurrences"],
        properties: {
          from: dateTime,
          to: dateTime,
          timeZone: { type: "string" },
          occurrences: { type: "array", items: ref("Occurrence") }
        }
      }
    }
  }
};
