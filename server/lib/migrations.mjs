/**
 * Append-only SQLite migrations, tracked per scope ("schedule", "auth", …) in schema_migrations.
 * Each migration runs in its own transaction; applied ones are skipped. Never edit an applied migration.
 */
export function applyMigrations(db, { scope, migrations, upTo = Infinity }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      scope      TEXT NOT NULL,
      id         INTEGER NOT NULL,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (scope, id)
    );
  `);

  const alreadyApplied = db.prepare("SELECT 1 FROM schema_migrations WHERE scope = ? AND id = ?");
  for (const migration of migrations) {
    if (migration.id > upTo || alreadyApplied.get(scope, migration.id)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      // The server or a CLI process may have applied it while this connection waited for the write lock.
      if (!alreadyApplied.get(scope, migration.id)) {
        db.exec(migration.sql);
        db.prepare("INSERT INTO schema_migrations (scope, id, name, applied_at) VALUES (?, ?, ?, ?)")
          .run(scope, migration.id, migration.name, new Date().toISOString());
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
