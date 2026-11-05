// GENERATED from server/lib/openapi.mjs by tools/generate-api-types.mjs. Do not edit by hand:
// run `npm run generate:api-types` after changing the API.
/* eslint-disable */
export const ROUTINE_MAX_INTERVAL = {
  "daily": 365,
  "weekly": 52,
  "monthly": 12
} as const;

export type paths = {
    "/api/admin/routines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List routines
         * @description Sorted by time of day.
         */
        get: operations["listRoutines"];
        put?: never;
        /** Create a routine */
        post: operations["createRoutine"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/routines/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        /** Get a routine */
        get: operations["getRoutine"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Edit a routine
         * @description Send only the fields to change. `recurrence` is replaced as a whole; exceptions on dates the new schedule no longer has are removed. The status is unchanged. Cancelled routines → 409.
         */
        patch: operations["updateRoutine"];
        trace?: never;
    };
    "/api/admin/routines/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel a routine
         * @description Keeps the record for history but hides it from the frame. Idempotent.
         */
        post: operations["cancelRoutine"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/routines/{id}/exceptions/{date}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Local date of the occurrence */
                date: components["parameters"]["OccurrenceDate"];
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Skip or dismiss one occurrence
         * @description `skipped`: it does not happen ("no school tomorrow"). `dismissed`: it happens but was acknowledged. The date must be on the routine's schedule.
         */
        put: operations["setRoutineException"];
        post?: never;
        /**
         * Restore one occurrence
         * @description Removes a skip or dismissal. Idempotent.
         */
        delete: operations["clearRoutineException"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/routines/{id}/pause": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Pause a routine
         * @description Without a body the routine is paused until resumed. With `resumeOn` it restarts automatically on that local date. Pausing again changes the date.
         */
        post: operations["pauseRoutine"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/routines/{id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resume a paused routine */
        post: operations["resumeRoutine"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/routines/occurrences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Upcoming occurrences of all routines
         * @description Occurrences in the window (from, to], sorted by time. Skipped ones are left out; dismissed ones are flagged.
         */
        get: operations["listRoutineOccurrences"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/timers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List timers
         * @description Running, paused and ringing timers, oldest first.
         */
        get: operations["listTimers"];
        put?: never;
        /** Start a timer */
        post: operations["createTimer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/timers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        /** Get a timer */
        get: operations["getTimer"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Rename or change the duration
         * @description A new `durationMs` keeps the start time: the deadline moves by the difference ("I meant 5 minutes, not 15"). If it has already elapsed the timer rings now. Closed timers → 409.
         */
        patch: operations["updateTimer"];
        trace?: never;
    };
    "/api/admin/timers/{id}/add-time": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add or remove time
         * @description Changes the duration by `deltaMs`, like PATCH. On a ringing timer the extra time counts from now (snooze).
         */
        post: operations["addTimerTime"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/timers/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel or silence a timer
         * @description Running/paused → `cancelled`, ringing → `dismissed`. Idempotent.
         */
        post: operations["cancelTimer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/timers/{id}/pause": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Pause a running timer */
        post: operations["pauseTimer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/timers/{id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resume a paused timer */
        post: operations["resumeTimer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What the frame should show
         * @description Running, paused and ringing timers, plus routine occurrences that are on screen now (until `dismissAt`) or become visible within 24 hours (`showFrom`). Skipped and dismissed occurrences are left out. The frame works out each item's phase from these times and `serverTime`.
         */
        get: operations["getPublicSchedule"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = {
    scheduleEvent: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Schedule event (outgoing)
         * @description Sent by the frame to FRAME_SCHEDULE_WEBHOOK_URL when a timer is created or starts ringing, a routine enters its notice window or a routine is due. One attempt, 5 s timeout. With FRAME_SCHEDULE_WEBHOOK_SECRET set, the secret is sent in the X-Frame-Webhook-Secret header. Events that happen while the server is down are not replayed.
         */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /** @description FRAME_SCHEDULE_WEBHOOK_SECRET, when configured. */
                    "X-Frame-Webhook-Secret"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ScheduleEvent"];
                };
            };
            responses: {
                /** @description Received. Any other status is logged. */
                "2XX": {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type components = {
    schemas: {
        AddTime: {
            /** @description Milliseconds to add (negative to remove). The resulting duration must stay within 1000–86400000. */
            deltaMs: number;
        };
        DailyRecurrence: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            frequency: "daily";
            /** @description Every N days, counted from startDate. */
            interval: number;
        };
        DailyRecurrenceInput: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            frequency: "daily";
            /**
             * @description Every N days, counted from startDate.
             * @default 1
             */
            interval: number;
        };
        Error: {
            /** @enum {unknown} */
            code: "invalid-input" | "not-found" | "invalid-transition" | "limit-reached" | "too-many-attempts" | "internal";
            /** @description Human-readable message naming the offending field. */
            error: string;
        };
        ExceptionInput: {
            /** @enum {unknown} */
            kind: "skipped" | "dismissed";
        };
        /** @description Icon key, or null for the default icon. */
        Icon: string | null;
        /**
         * @description Icon key; null = default icon. Known keys: alarm, apple, baby, backpack, bath, bed, bike, book, bus, cake, car, cat, doctor, dog, egg, game, gift, graduation, heart, medicine, moon, music, paint, party, phone, pizza, pot, puzzle, school, shirt, shower, soup, sparkles, sport, star, sun, timer, trash, tv, utensils. Other well-formed keys are accepted and shown as an exclamation mark.
         * @example pot
         */
        IconInput: string | null;
        MonthlyRecurrence: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            frequency: "monthly";
            /** @description Every N months, counted from startDate. */
            interval: number;
            /** @description Day of the month; 29–31 fall on the last day in shorter months. */
            monthDay: number;
        };
        MonthlyRecurrenceInput: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            frequency: "monthly";
            /**
             * @description Every N months, counted from startDate.
             * @default 1
             */
            interval: number;
            /** @description Day of the month; 29–31 fall on the last day in shorter months. */
            monthDay: number;
        };
        NextOccurrence: {
            /** Format: date-time */
            at: string;
            /**
             * Format: date
             * @example 2025-09-15
             */
            date: string;
            dismissed: boolean;
        };
        Occurrence: {
            /**
             * Format: date-time
             * @description When it is due.
             */
            at: string;
            /**
             * Format: date
             * @description Local date of the occurrence.
             * @example 2025-09-15
             */
            date: string;
            /**
             * Format: date-time
             * @description at + autoDismissMs: when it leaves the screen.
             */
            dismissAt: string;
            /** @description Acknowledged through a `dismissed` exception. */
            dismissed: boolean;
            icon: components["schemas"]["Icon"];
            noticeMinutes: number;
            /** Format: uuid */
            routineId: string;
            /**
             * Format: date-time
             * @description at − noticeMinutes: when the frame starts the countdown.
             */
            showFrom: string;
            style: components["schemas"]["Style"];
            title: string;
        };
        OccurrenceList: {
            /** Format: date-time */
            from: string;
            occurrences: components["schemas"]["Occurrence"][];
            timeZone: string;
            /** Format: date-time */
            to: string;
        };
        PauseRoutine: {
            /** @description Future local date on which the routine restarts. */
            resumeOn?: string | null;
        };
        PublicSchedule: {
            /** @description Sorted by time. */
            routines: components["schemas"]["Occurrence"][];
            /**
             * Format: date-time
             * @description Server clock when the response was built.
             */
            serverTime: string;
            /** @description Running, paused and ringing timers. */
            timers: components["schemas"]["Timer"][];
            /** @example Europe/Rome */
            timeZone: string;
        };
        Recurrence: components["schemas"]["DailyRecurrence"] | components["schemas"]["WeeklyRecurrence"] | components["schemas"]["MonthlyRecurrence"];
        RecurrenceInput: components["schemas"]["DailyRecurrenceInput"] | components["schemas"]["WeeklyRecurrenceInput"] | components["schemas"]["MonthlyRecurrenceInput"];
        Routine: {
            autoDismissMs: number;
            /** Format: date-time */
            cancelledAt: string | null;
            /** Format: date-time */
            createdAt: string;
            endDate: string | null;
            /** @description From today onwards. */
            exceptions: components["schemas"]["RoutineException"][];
            icon: components["schemas"]["Icon"];
            /** Format: uuid */
            id: string;
            /** @description null when paused without a date, cancelled or ended. */
            nextOccurrence: components["schemas"]["NextOccurrence"] | null;
            noticeMinutes: number;
            recurrence: components["schemas"]["Recurrence"];
            resumeOn: string | null;
            /**
             * Format: date
             * @example 2025-09-15
             */
            startDate: string;
            /** @enum {unknown} */
            status: "active" | "paused" | "cancelled";
            style: components["schemas"]["Style"];
            /** @example 08:10 */
            time: string;
            /** @example Europe/Rome */
            timeZone: string;
            title: string;
            /** Format: date-time */
            updatedAt: string;
        };
        RoutineCreate: {
            /** @description How long each occurrence stays on screen after its time, like a ringing timer. Defaults to FRAME_ROUTINE_AUTO_DISMISS_SECONDS (60 s). */
            autoDismissMs?: number;
            /** @description Last possible date (inclusive); null = no end. */
            endDate?: string | null;
            icon?: components["schemas"]["IconInput"];
            /**
             * @description How many minutes before each occurrence the frame starts showing the countdown.
             * @default 15
             */
            noticeMinutes: number;
            recurrence: components["schemas"]["RecurrenceInput"];
            /**
             * Format: date
             * @description First possible date; anchors the interval. Defaults to today.
             * @example 2025-09-15
             */
            startDate?: string;
            /** @description How the routine countdown is drawn. Defaults to FRAME_ROUTINE_STYLE (clock). */
            style?: components["schemas"]["Style"];
            /**
             * @description Local wall-clock time (24 h) in the frame time zone.
             * @example 08:10
             */
            time: string;
            /** @example Take kids to school */
            title: string;
        };
        RoutineDueEvent: {
            /**
             * Format: date-time
             * @description The occurrence time.
             */
            at: string;
            occurrence: components["schemas"]["Occurrence"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "routine.due";
        };
        RoutineEnvelope: {
            routine: components["schemas"]["Routine"];
        };
        RoutineException: {
            /**
             * Format: date
             * @example 2025-09-15
             */
            date: string;
            /** @enum {unknown} */
            kind: "skipped" | "dismissed";
        };
        RoutineList: {
            routines: components["schemas"]["Routine"][];
        };
        RoutinePatch: {
            /** @description How long each occurrence stays on screen after its time, like a ringing timer. Defaults to FRAME_ROUTINE_AUTO_DISMISS_SECONDS (60 s). */
            autoDismissMs?: number;
            /** @description Last possible date (inclusive); null = no end. */
            endDate?: string | null;
            icon?: components["schemas"]["IconInput"];
            /**
             * @description How many minutes before each occurrence the frame starts showing the countdown.
             * @default 15
             */
            noticeMinutes: number;
            recurrence?: components["schemas"]["RecurrenceInput"];
            /**
             * Format: date
             * @description First possible date; anchors the interval. Defaults to today.
             * @example 2025-09-15
             */
            startDate?: string;
            /** @description How the routine countdown is drawn. Defaults to FRAME_ROUTINE_STYLE (clock). */
            style?: components["schemas"]["Style"];
            /**
             * @description Local wall-clock time (24 h) in the frame time zone.
             * @example 08:10
             */
            time?: string;
            /** @example Take kids to school */
            title?: string;
        };
        RoutineUpcomingEvent: {
            /**
             * Format: date-time
             * @description showFrom: the notice window opened.
             */
            at: string;
            occurrence: components["schemas"]["Occurrence"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "routine.upcoming";
        };
        ScheduleEvent: components["schemas"]["TimerCreatedEvent"] | components["schemas"]["TimerFinishedEvent"] | components["schemas"]["RoutineUpcomingEvent"] | components["schemas"]["RoutineDueEvent"];
        /**
         * @description `disc`: shrinking coloured slice · `sweets`: one block per minute · `journey`: a snail walking to the goal · `clock`: clock face with a zone up to the time.
         * @enum {unknown}
         */
        Style: "disc" | "sweets" | "journey" | "clock";
        Timer: {
            autoDismissMs: number;
            /** Format: date-time */
            closedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /**
             * Format: date-time
             * @description When a ringing timer will disappear; null otherwise.
             */
            dismissAt: string | null;
            /** @description Total countdown, including added time. */
            durationMs: number;
            /**
             * Format: date-time
             * @description Deadline while running (when it rang once finished); null while paused.
             */
            endsAt: string | null;
            /** Format: date-time */
            finishedAt: string | null;
            icon: components["schemas"]["Icon"];
            /** Format: uuid */
            id: string;
            /** @description At the time of the response. */
            remainingMs: number;
            /**
             * @description `finished` = ringing.
             * @enum {unknown}
             */
            status: "running" | "paused" | "finished" | "cancelled" | "dismissed";
            style: components["schemas"]["Style"];
            title: string;
            /** Format: date-time */
            updatedAt: string;
        };
        TimerCreate: {
            /** @description How long the timer rings once finished before disappearing; 0 = until cancelled. Defaults to FRAME_TIMER_AUTO_DISMISS_SECONDS (60 s). */
            autoDismissMs?: number;
            /** @description Total countdown in milliseconds (10 minutes = 600000). */
            durationMs: number;
            icon?: components["schemas"]["IconInput"];
            /** @description How the timer countdown is drawn. Defaults to FRAME_TIMER_STYLE (disc). */
            style?: components["schemas"]["Style"];
            /** @example Pasta is ready */
            title: string;
        };
        TimerCreatedEvent: {
            /**
             * Format: date-time
             * @description When it was created.
             */
            at: string;
            timer: components["schemas"]["Timer"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "timer.created";
        };
        TimerEnvelope: {
            timer: components["schemas"]["Timer"];
        };
        TimerFinishedEvent: {
            /**
             * Format: date-time
             * @description When it started ringing.
             */
            at: string;
            timer: components["schemas"]["Timer"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "timer.finished";
        };
        TimerList: {
            timers: components["schemas"]["Timer"][];
        };
        TimerPatch: {
            /** @description How long the timer rings once finished before disappearing; 0 = until cancelled. Defaults to FRAME_TIMER_AUTO_DISMISS_SECONDS (60 s). */
            autoDismissMs?: number;
            /** @description Total countdown in milliseconds (10 minutes = 600000). */
            durationMs?: number;
            icon?: components["schemas"]["IconInput"];
            /** @description How the timer countdown is drawn. Defaults to FRAME_TIMER_STYLE (disc). */
            style?: components["schemas"]["Style"];
            /** @example Pasta is ready */
            title?: string;
        };
        UnauthorizedError: {
            /** @constant */
            error: "Admin PIN or API token required";
        };
        /** @enum {unknown} */
        Weekday: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
        /**
         * @description mon, tue, wed, thu, fri, sat or sun (case-insensitive).
         * @example mon
         */
        WeekdayInput: string;
        WeeklyRecurrence: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            frequency: "weekly";
            /** @description Every N weeks, counted from startDate. */
            interval: number;
            /**
             * @description Three-letter weekday names. Numbers are rejected: 0–6 is ambiguous.
             * @example [
             *       "mon",
             *       "tue",
             *       "wed",
             *       "thu",
             *       "fri"
             *     ]
             */
            weekdays: components["schemas"]["Weekday"][];
        };
        WeeklyRecurrenceInput: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            frequency: "weekly";
            /**
             * @description Every N weeks, counted from startDate.
             * @default 1
             */
            interval: number;
            /**
             * @description Three-letter weekday names. Numbers are rejected: 0–6 is ambiguous.
             * @example [
             *       "mon",
             *       "tue",
             *       "wed",
             *       "thu",
             *       "fri"
             *     ]
             */
            weekdays: components["schemas"]["WeekdayInput"][];
        };
    };
    responses: {
        /** @description Invalid input */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Not allowed in the current state */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Unknown id */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Too many wrong attempts from this device (code too-many-attempts) */
        TooManyAttempts: {
            headers: {
                /** @description Seconds until the block ends */
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Missing or wrong PIN or token */
        Unauthorized: {
            headers: {
                /** @description Always `Bearer realm="family-frame"` */
                "WWW-Authenticate"?: string;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["UnauthorizedError"];
            };
        };
    };
    parameters: {
        /** @description Local date of the occurrence */
        OccurrenceDate: string;
        /** @description Routine id */
        RoutineId: string;
        /** @description Timer id */
        TimerId: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    listRoutines: {
        parameters: {
            query?: {
                /** @description Also return cancelled routines. */
                includeCancelled?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Routines */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    createRoutine: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoutineCreate"];
            };
        };
        responses: {
            /** @description Created, active */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineEnvelope"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    getRoutine: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Routine */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    updateRoutine: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoutinePatch"];
            };
        };
        responses: {
            /** @description Updated routine */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineEnvelope"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    cancelRoutine: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cancelled routine */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    setRoutineException: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Local date of the occurrence */
                date: components["parameters"]["OccurrenceDate"];
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExceptionInput"];
            };
        };
        responses: {
            /** @description Routine with the exception */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineEnvelope"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    clearRoutineException: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Local date of the occurrence */
                date: components["parameters"]["OccurrenceDate"];
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Routine without the exception */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineEnvelope"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    pauseRoutine: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PauseRoutine"];
            };
        };
        responses: {
            /** @description Paused routine */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineEnvelope"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    resumeRoutine: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Routine id */
                id: components["parameters"]["RoutineId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Active routine */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoutineEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    listRoutineOccurrences: {
        parameters: {
            query?: {
                /** @description Window start with offset, e.g. `2025-09-15T00:00:00Z`. Default: now. */
                from?: string;
                /** @description Window end. Default: `from` + 24 h. At most 31 days after `from`. */
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Occurrences */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OccurrenceList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    listTimers: {
        parameters: {
            query?: {
                /** @description Also return cancelled and dismissed timers (kept 30 days). */
                includeClosed?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Timers */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimerList"];
                };
            };
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    createTimer: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TimerCreate"];
            };
        };
        responses: {
            /** @description Created, running */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimerEnvelope"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            /** @description Already 3 active timers (code limit-reached) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            429: components["responses"]["TooManyAttempts"];
        };
    };
    getTimer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Timer */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimerEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    updateTimer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TimerPatch"];
            };
        };
        responses: {
            /** @description Updated timer */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimerEnvelope"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    addTimerTime: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddTime"];
            };
        };
        responses: {
            /** @description Updated timer */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimerEnvelope"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    cancelTimer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Closed timer */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimerEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    pauseTimer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Paused timer */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimerEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    resumeTimer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Timer id */
                id: components["parameters"]["TimerId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Running timer */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimerEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["TooManyAttempts"];
        };
    };
    getPublicSchedule: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Schedule snapshot */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicSchedule"];
                };
            };
        };
    };
}
