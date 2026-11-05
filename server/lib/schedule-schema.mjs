// SQLite schema for one-off timers and routine appointments.
// Lives in the same database file as settings (runtime.settingsDbPath).
//
// Conventions:
// - Instants (deadlines, audit timestamps) are INTEGER Unix epoch milliseconds: they need
//   arithmetic (remaining = ends_at - now) and compare correctly as numbers.
// - Wall-clock concepts of routines ("08:10", "2025-09-10") are TEXT in the frame's time zone,
//   never instants, so DST changes do not shift them.
// - Migrations are append-only. Never edit an applied migration; add a new one.
import { applyMigrations } from "./migrations.mjs";

export const scheduleMigrations = [
  {
    id: 1,
    name: "create-timers-and-routines",
    sql: `
      CREATE TABLE timers (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
        duration_ms   INTEGER NOT NULL CHECK (duration_ms BETWEEN 1000 AND 86400000),
        status        TEXT NOT NULL
                      CHECK (status IN ('running', 'paused', 'finished', 'cancelled', 'dismissed')),
        -- Absolute deadline while running (and the moment it rang once finished).
        ends_at       INTEGER,
        -- Time left, frozen while paused.
        remaining_ms  INTEGER CHECK (remaining_ms IS NULL OR remaining_ms > 0),
        finished_at   INTEGER,
        closed_at     INTEGER,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        CHECK (status <> 'running'   OR (ends_at IS NOT NULL AND remaining_ms IS NULL)),
        CHECK (status <> 'paused'    OR (ends_at IS NULL AND remaining_ms IS NOT NULL)),
        CHECK (status <> 'finished'  OR (finished_at IS NOT NULL AND closed_at IS NULL)),
        CHECK (status NOT IN ('cancelled', 'dismissed') OR closed_at IS NOT NULL),
        CHECK (status <> 'dismissed' OR finished_at IS NOT NULL)
      ) STRICT;

      CREATE INDEX timers_status_ends_at ON timers (status, ends_at);

      CREATE TABLE routines (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
        -- Local wall-clock time HH:MM in the frame time zone.
        time_of_day     TEXT NOT NULL
                        CHECK (time_of_day GLOB '[01][0-9]:[0-5][0-9]' OR time_of_day GLOB '2[0-3]:[0-5][0-9]'),
        frequency       TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
        repeat_interval INTEGER NOT NULL DEFAULT 1 CHECK (repeat_interval BETWEEN 1 AND 365),
        -- Weekly only: bitmask, bit n = weekday n (0 = Sunday … 6 = Saturday). Mon–Fri = 62.
        weekdays_mask   INTEGER CHECK (weekdays_mask BETWEEN 1 AND 127),
        -- Monthly only: 1–31; clamped to the last day in shorter months.
        month_day       INTEGER CHECK (month_day BETWEEN 1 AND 31),
        -- Local dates YYYY-MM-DD. start_date anchors the interval ("every 2 weeks").
        start_date      TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
        end_date        TEXT CHECK (end_date IS NULL OR end_date >= start_date),
        -- How many minutes before the occurrence the frame starts showing the countdown.
        notice_minutes  INTEGER NOT NULL DEFAULT 15 CHECK (notice_minutes BETWEEN 0 AND 1440),
        status          TEXT NOT NULL CHECK (status IN ('active', 'paused', 'cancelled')),
        -- Paused only: first local date on which the routine runs again; NULL = until resumed.
        resume_on       TEXT CHECK (resume_on IS NULL OR status = 'paused'),
        cancelled_at    INTEGER CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        CHECK ((frequency = 'weekly')  = (weekdays_mask IS NOT NULL)),
        CHECK ((frequency = 'monthly') = (month_day IS NOT NULL))
      ) STRICT;

      CREATE INDEX routines_status ON routines (status);

      -- Per-occurrence overrides, keyed by the occurrence's local date.
      -- skipped:   this occurrence does not happen ("no school tomorrow").
      -- dismissed: it happens but was acknowledged, so the frame stops highlighting it.
      CREATE TABLE routine_exceptions (
        routine_id      TEXT NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
        occurrence_date TEXT NOT NULL
                        CHECK (occurrence_date GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
        kind            TEXT NOT NULL CHECK (kind IN ('skipped', 'dismissed')),
        created_at      INTEGER NOT NULL,
        PRIMARY KEY (routine_id, occurrence_date)
      ) STRICT, WITHOUT ROWID;
    `
  },
  {
    id: 2,
    name: "timer-auto-dismiss",
    sql: `
      -- How long a finished timer keeps ringing before it is dismissed automatically; 0 = until cancelled.
      -- Captured per timer at creation so changing the server default never alters running timers.
      ALTER TABLE timers ADD COLUMN auto_dismiss_ms INTEGER NOT NULL DEFAULT 60000
        CHECK (auto_dismiss_ms BETWEEN 0 AND 3600000);
    `
  },
  {
    id: 3,
    name: "routine-auto-dismiss",
    sql: `
      -- How long an occurrence stays on screen ("ringing") after its time. Always > 0: the frame has no
      -- touchscreen, so routines must leave the screen by themselves.
      ALTER TABLE routines ADD COLUMN auto_dismiss_ms INTEGER NOT NULL DEFAULT 60000
        CHECK (auto_dismiss_ms BETWEEN 1000 AND 3600000);
    `
  },
  {
    id: 4,
    name: "display-style-and-icon",
    sql: `
      -- How the countdown is drawn, and an optional icon key (unknown keys are drawn as "!").
      ALTER TABLE timers ADD COLUMN style TEXT NOT NULL DEFAULT 'disc'
        CHECK (style IN ('disc', 'sweets', 'journey', 'clock'));
      ALTER TABLE timers ADD COLUMN icon TEXT CHECK (icon IS NULL OR length(icon) BETWEEN 1 AND 40);
      ALTER TABLE routines ADD COLUMN style TEXT NOT NULL DEFAULT 'clock'
        CHECK (style IN ('disc', 'sweets', 'journey', 'clock'));
      ALTER TABLE routines ADD COLUMN icon TEXT CHECK (icon IS NULL OR length(icon) BETWEEN 1 AND 40);
    `
  }
];

/** Applies pending schedule migrations in order. `upTo` exists for upgrade tests. */
export function applyScheduleMigrations(db, { upTo = Infinity } = {}) {
  applyMigrations(db, { scope: "schedule", migrations: scheduleMigrations, upTo });
}
